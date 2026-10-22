import { createHash } from 'node:crypto';
import {
  requireWorkspace,
  startIngest,
  type LibraryDeps,
} from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import {
  LIBRARY_MAX_BYTES,
  bytesMatchFileKind,
  fileKindForContentType,
  reviewDueAt,
} from '@/server/domain/library/library';
import {
  AlreadyInLibraryError,
  LibraryStateError,
  libraryValidation,
} from '@/server/domain/library/library_errors';
import type { LibraryDocumentEntity } from '@/server/domain/library/library_entities';

export class CompleteLibraryUploadUseCase {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(documentId: string, context: RequestContext): Promise<LibraryDocumentEntity> {
    const { documents, store, audit, transactions } = this.deps;
    const workspaceId = requireWorkspace(context);

    const pending = await documents.findById(workspaceId, documentId);
    // Only the uploader completes a pending upload; anyone else, and another
    // workspace, sees "not found".
    if (!pending || pending.created_by !== context.user_id || pending.source_type !== 'upload' || !pending.storage_key) {
      throw new NotFoundError('Library upload', documentId);
    }
    if (pending.uploaded_at !== null) {
      // A retried complete (a double click, a lost response) changes nothing.
      return pending;
    }

    const bytes = await store.getObject(pending.storage_key, LIBRARY_MAX_BYTES);
    if (!bytes) {
      throw new LibraryStateError('upload_not_found', 'The file has not reached storage yet');
    }

    // The browser declared size, hash and type at presign; the stored bytes
    // decide. Any mismatch removes the object and the row, so a rejected file
    // cannot be retried into acceptance.
    const rejection = this.inspect(pending, bytes);
    if (rejection) {
      await this.discard(pending);
      throw libraryValidation(rejection.code, 'file', rejection.detail);
    }

    const duplicate = await documents.findDuplicate(workspaceId, pending.content_hash, pending.scopes, pending.id);
    if (duplicate) {
      await this.discard(pending);
      throw new AlreadyInLibraryError(duplicate.id);
    }

    const now = this.deps.now();
    const uploaded = await transactions.run(async () => {
      const updated = await documents.update(workspaceId, pending.id, {
        uploaded_at: now,
        review_due_at: reviewDueAt(now, pending.review_interval_days),
      });
      await audit.log({
        action: 'library.document.uploaded',
        context,
        target_resource_type: 'library_document',
        target_resource_id: pending.id,
        metadata: {
          source_type: 'upload',
          mime_type: pending.mime_type,
          byte_size: pending.byte_size,
          scope_count: pending.scopes.length,
        },
      });
      return updated;
    });

    return (await startIngest(this.deps, uploaded, context, 'ingest')).document;
  }

  private inspect(pending: LibraryDocumentEntity, bytes: Uint8Array): { code: string; detail: string } | null {
    if (bytes.length === 0 || bytes.length > LIBRARY_MAX_BYTES || bytes.length !== pending.byte_size) {
      return { code: 'size_mismatch', detail: 'The uploaded file is not the size that was declared' };
    }
    if (createHash('sha256').update(bytes).digest('hex') !== pending.content_hash) {
      return { code: 'hash_mismatch', detail: 'The uploaded file is not the file that was declared' };
    }
    // The declared type was validated at presign; here only the bytes are trusted.
    const kind = fileKindForContentType(pending.mime_type);
    if (kind === null || !bytesMatchFileKind(kind, bytes)) {
      return { code: 'file_content_mismatch', detail: 'The file content does not match its type' };
    }
    return null;
  }

  private async discard(pending: LibraryDocumentEntity): Promise<void> {
    const { documents, store, log } = this.deps;
    try {
      if (pending.storage_key) {
        await store.deleteObject(pending.storage_key);
      }
    } catch {
      // The rejection the caller needs must not be replaced by a cleanup
      // failure; the leftover object is reported by code, not by content.
      log.warn('library.cleanup_failed', { workspace_id: pending.workspace_id, document_id: pending.id });
    }
    await documents.delete(pending.workspace_id, pending.id);
  }
}
