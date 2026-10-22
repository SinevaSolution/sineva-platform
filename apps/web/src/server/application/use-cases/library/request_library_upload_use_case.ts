import type { RequestLibraryUploadDto } from '@/server/application/dtos/library_dto';
import {
  inheritedScopes,
  loadVisibleFolder,
  monthStart,
  requireWorkspace,
  resolveScopes,
  type LibraryDeps,
} from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ENTITLEMENT_KEYS } from '@/server/domain/entitlements/entitlements';
import {
  LIBRARY_MAX_BYTES,
  LIBRARY_PRESIGN_SECONDS,
  isValidSha256,
  resolveFileType,
  sourceObjectKey,
  titleFromFileName,
} from '@/server/domain/library/library';
import { AlreadyInLibraryError, libraryValidation } from '@/server/domain/library/library_errors';

export interface LibraryUploadTicket {
  document_id: string;
  upload_url: string;
  method: 'PUT';
  /** Headers the browser must send with the PUT, exactly as listed. */
  headers: Record<string, string>;
  expires_in_seconds: number;
  max_bytes: number;
}

const MB = 1024 * 1024;

export class RequestLibraryUploadUseCase {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(dto: RequestLibraryUploadDto, context: RequestContext): Promise<LibraryUploadTicket> {
    const { documents, folders, store, entitlements } = this.deps;
    const workspaceId = requireWorkspace(context);

    // The route schema checks these too; the use case repeats them because it
    // is the unit that must never presign something out of bounds.
    const file = resolveFileType(dto.file_name, dto.content_type);
    if (!Number.isInteger(dto.byte_size) || dto.byte_size < 1 || dto.byte_size > LIBRARY_MAX_BYTES) {
      throw libraryValidation('file_too_large', 'byte_size', 'A file must be between 1 byte and 25 MB');
    }
    if (!isValidSha256(dto.sha256)) {
      throw libraryValidation('invalid_sha256', 'sha256', 'sha256 must be 64 lowercase hex characters');
    }

    const folder = await loadVisibleFolder(folders, context, dto.folder_id);
    // No scopes sent means "whatever the collection says" (ADR-0033); sending
    // scopes is a deliberate override and stops following the collection.
    const inherited = !dto.scopes || dto.scopes.length === 0;
    const scopes = inherited ? inheritedScopes(folder, context) : resolveScopes(dto.scopes, context);

    const duplicate = await documents.findDuplicate(workspaceId, dto.sha256, scopes);
    if (duplicate) {
      throw new AlreadyInLibraryError(duplicate.id);
    }

    // Quotas go through the entitlement seam: `open` mode logs and passes, an
    // enforced limit blocks this new upload only. Nothing that exists is touched.
    const usage = await documents.usage(workspaceId, monthStart(this.deps.now()));
    await entitlements.assert(workspaceId, ENTITLEMENT_KEYS.DOCUMENTS, usage.documents + 1);
    await entitlements.assert(workspaceId, ENTITLEMENT_KEYS.STORAGE_MB, Math.ceil((usage.storage_bytes + dto.byte_size) / MB));
    if (file.ocr) {
      // Pages are unknown before reading; the check asks whether this month's
      // quota still has room for at least one more page.
      await entitlements.assert(workspaceId, ENTITLEMENT_KEYS.OCR_PAGES, usage.ocr_pages_month + 1);
    }

    // The key contains the document id, which the database assigns, so the row
    // is created first and the key written right after.
    const created = await documents.create({
      workspace_id: workspaceId,
      folder_id: dto.folder_id ?? null,
      title: titleFromFileName(dto.file_name),
      source_type: 'upload',
      storage_key: null,
      mime_type: file.content_type,
      byte_size: dto.byte_size,
      content_hash: dto.sha256,
      status_detail: null,
      review_interval_days: dto.review_interval_days ?? null,
      review_due_at: null,
      uploaded_at: null,
      created_by: context.user_id,
      scopes,
      access_inherited: inherited,
    });
    const key = sourceObjectKey(workspaceId, created.id);
    await documents.update(workspaceId, created.id, { storage_key: key });

    try {
      const presigned = await store.createPresignedPut({
        key,
        content_type: file.content_type,
        size_bytes: dto.byte_size,
        expires_in_seconds: LIBRARY_PRESIGN_SECONDS,
      });
      return {
        document_id: created.id,
        upload_url: presigned.upload_url,
        method: 'PUT',
        headers: { 'Content-Type': file.content_type },
        expires_in_seconds: presigned.expires_in_seconds,
        max_bytes: LIBRARY_MAX_BYTES,
      };
    } catch (error) {
      // A failed presign (a 502 from the adapter, never an unsigned URL) must
      // not leave a pending row behind.
      await documents.delete(workspaceId, created.id);
      throw error;
    }
  }
}
