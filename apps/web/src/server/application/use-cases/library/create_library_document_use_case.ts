import { createHash } from 'node:crypto';
import { detectPii } from '@sineva/shared';
import type { CreateLibraryDocumentDto } from '@/server/application/dtos/library_dto';
import { resolveOwnedConversation } from '@/server/application/chat/resolve_owned_conversation';
import {
  inheritedScopes,
  loadVisibleFolder,
  monthStart,
  requireWorkspace,
  resolveScopes,
  startIngest,
  type LibraryDeps,
} from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ENTITLEMENT_KEYS } from '@/server/domain/entitlements/entitlements';
import { CANONICAL_SPECIALIST_SLUGS } from '@/server/domain/chat/specialist_catalog';
import {
  LIBRARY_MAX_BYTES,
  reviewDueAt,
  sourceObjectKey,
} from '@/server/domain/library/library';
import type { ScopeRef } from '@/server/domain/library/library_access';
import { AlreadyInLibraryError, libraryValidation } from '@/server/domain/library/library_errors';
import type { LibraryDocumentEntity, LibraryStatusDetail } from '@/server/domain/library/library_entities';
import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';

const MB = 1024 * 1024;
const NOTE_CONTENT_TYPE = 'text/markdown';
/** KTP and NPWP only: a phone number or an email in a price list is normal business text. */
const PERSONAL_DATA_KINDS = new Set(['nik', 'npwp']);

export interface CreateLibraryDocumentDeps extends LibraryDeps {
  conversations: ConversationRepository;
}

/**
 * A note typed in the Library, or text saved from a chat (FR-LIB-12): a
 * deliberate action, never automatic. The platform computes the hash itself
 * because it is the one holding the bytes. The saved text comes from the
 * request like a note would; only the conversation is checked, because it
 * decides the default scope and must belong to the caller.
 */
export class CreateLibraryDocumentUseCase {
  constructor(private readonly deps: CreateLibraryDocumentDeps) {}

  async execute(dto: CreateLibraryDocumentDto, context: RequestContext): Promise<LibraryDocumentEntity> {
    const { documents, folders, store, entitlements, audit, transactions, conversations } = this.deps;
    const workspaceId = requireWorkspace(context);

    const folder = await loadVisibleFolder(folders, context, dto.folder_id);

    let defaults: ScopeRef[] = [];
    let title: string;
    if (dto.source_type === 'chat_save') {
      const conversation = await resolveOwnedConversation(conversations, dto.conversation_id, context);
      const slug = conversation.agent_slug?.toLowerCase();
      if (conversation.kind === 'room' && slug && slug !== 'sino' && CANONICAL_SPECIALIST_SLUGS.has(slug)) {
        defaults = [{ scope_type: 'specialist', scope_ref: slug }];
      }
      // The content is trimmed and non-empty, so its first line is never empty.
      title = dto.title ?? dto.content.split('\n')[0]!.trim().slice(0, 80);
    } else {
      title = dto.title;
    }
    // Nothing chosen and no Room default: follow the collection (ADR-0033).
    const inherited = !dto.scopes?.length && defaults.length === 0;
    const scopes = inherited ? inheritedScopes(folder, context) : resolveScopes(dto.scopes, context, defaults);

    const bytes = new TextEncoder().encode(dto.content);
    if (bytes.length > LIBRARY_MAX_BYTES) {
      throw libraryValidation('file_too_large', 'content', 'The text is too large');
    }
    const hash = createHash('sha256').update(bytes).digest('hex');
    const duplicate = await documents.findDuplicate(workspaceId, hash, scopes);
    if (duplicate) {
      throw new AlreadyInLibraryError(duplicate.id);
    }

    const usage = await documents.usage(workspaceId, monthStart(this.deps.now()));
    await entitlements.assert(workspaceId, ENTITLEMENT_KEYS.DOCUMENTS, usage.documents + 1);
    await entitlements.assert(workspaceId, ENTITLEMENT_KEYS.STORAGE_MB, Math.ceil((usage.storage_bytes + bytes.length) / MB));

    const hint: LibraryStatusDetail | null = detectPii(dto.content).some((match) => PERSONAL_DATA_KINDS.has(match.kind))
      ? { personal_data_hint: true }
      : null;
    const interval = dto.source_type === 'note' ? (dto.review_interval_days ?? null) : null;

    const created = await documents.create({
      workspace_id: workspaceId,
      folder_id: dto.folder_id ?? null,
      title,
      source_type: dto.source_type,
      storage_key: null,
      mime_type: NOTE_CONTENT_TYPE,
      byte_size: bytes.length,
      content_hash: hash,
      status_detail: hint,
      review_interval_days: interval,
      review_due_at: null,
      uploaded_at: null,
      created_by: context.user_id,
      scopes,
      access_inherited: inherited,
    });
    const key = sourceObjectKey(workspaceId, created.id);
    await documents.update(workspaceId, created.id, { storage_key: key });
    try {
      await store.putObject(key, bytes, NOTE_CONTENT_TYPE);
    } catch (error) {
      await documents.delete(workspaceId, created.id);
      throw error;
    }

    const now = this.deps.now();
    const stored = await transactions.run(async () => {
      const updated = await documents.update(workspaceId, created.id, {
        uploaded_at: now,
        review_due_at: reviewDueAt(now, interval),
      });
      await audit.log({
        action: 'library.document.uploaded',
        context,
        target_resource_type: 'library_document',
        target_resource_id: created.id,
        metadata: {
          source_type: dto.source_type,
          mime_type: NOTE_CONTENT_TYPE,
          byte_size: bytes.length,
          scope_count: scopes.length,
        },
      });
      return updated;
    });

    return (await startIngest(this.deps, stored, context, 'ingest')).document;
  }
}
