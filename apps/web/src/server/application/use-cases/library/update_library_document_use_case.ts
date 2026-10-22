import type { UpdateLibraryDocumentDto } from '@/server/application/dtos/library_dto';
import {
  assertFolderExists,
  mintCall,
  requireWorkspace,
  resolveScopes,
  resolveVisibleDocument,
  type LibraryDeps,
} from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { DomainError } from '@/server/domain/errors/domain_error';
import { reviewDueAt } from '@/server/domain/library/library';
import { principalsForScopes } from '@/server/domain/library/library_access';
import type { LibraryDocumentEntity } from '@/server/domain/library/library_entities';
import type { LibraryDocumentPatch } from '@/server/domain/repositories/library_repository';

export class UpdateLibraryDocumentUseCase {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(
    documentId: string,
    dto: UpdateLibraryDocumentDto,
    context: RequestContext,
  ): Promise<LibraryDocumentEntity> {
    const { documents, folders, audit, transactions, gateway, log } = this.deps;
    const workspaceId = requireWorkspace(context);
    const document = await resolveVisibleDocument(documents, context, documentId);

    if (dto.folder_id !== undefined) {
      await assertFolderExists(folders, workspaceId, dto.folder_id);
    }
    const nextScopes = dto.scopes ? resolveScopes(dto.scopes, context) : null;
    const before = principalsForScopes(document.scopes);
    const after = nextScopes ? principalsForScopes(nextScopes) : before;
    const scopesChanged = nextScopes !== null && before.join('|') !== after.join('|');
    const now = this.deps.now();

    const patch: LibraryDocumentPatch = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.folder_id !== undefined) patch.folder_id = dto.folder_id;
    if (dto.review_interval_days !== undefined) {
      patch.review_interval_days = dto.review_interval_days;
      patch.review_due_at = reviewDueAt(now, dto.review_interval_days);
      // A new interval re-arms the reminder.
      patch.review_reminded_at = null;
    }

    let updated = await transactions.run(async () => {
      if (scopesChanged && nextScopes) {
        await documents.replaceScopes(workspaceId, document.id, nextScopes);
        // The acl in sineva-ai is stale until the relabel below succeeds; the
        // null makes that visible instead of implicit.
        patch.acl_synced_at = null;
        await audit.log({
          action: 'library.document.scope_changed',
          context,
          target_resource_type: 'library_document',
          target_resource_id: document.id,
          change: { before: { scopes: before }, after: { scopes: after } },
        });
      }
      return Object.keys(patch).length > 0
        ? documents.update(workspaceId, document.id, patch)
        : document;
    });

    if (!scopesChanged) {
      return updated;
    }

    if (document.ingest_attempted_at === null) {
      // Nothing was ever sent to sineva-ai, so there are no chunks to relabel.
      return documents.update(workspaceId, document.id, { acl_synced_at: now });
    }
    try {
      // A relabel, never a re-embed (FR-LIB-14): chunks keep their vectors.
      await gateway.updateAcl(
        { tenant_id: workspaceId, document_id: document.id, acl: after },
        await mintCall(this.deps, context),
      );
    } catch (error) {
      if (error instanceof DomainError) {
        log.warn('library.acl_sync_failed', { workspace_id: workspaceId, document_id: document.id, status: error.status });
      }
      // The new scopes are saved and `acl_synced_at` stays null, so the state
      // is visible and the same PATCH or a reindex repairs it.
      throw error;
    }
    updated = await documents.update(workspaceId, document.id, { acl_synced_at: now });
    return updated;
  }
}
