import type { UpdateLibraryDocumentDto } from '@/server/application/dtos/library_dto';
import {
  applyDocumentScopes,
  inheritedScopes,
  loadVisibleFolder,
  requireWorkspace,
  resolveScopesChecked,
  resolveVisibleDocument,
  type LibraryDeps,
} from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { reviewDueAt } from '@/server/domain/library/library';
import type { ScopeRef } from '@/server/domain/library/library_access';
import type { LibraryDocumentEntity } from '@/server/domain/library/library_entities';
import type { LibraryDocumentPatch } from '@/server/domain/repositories/library_repository';

export class UpdateLibraryDocumentUseCase {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(
    documentId: string,
    dto: UpdateLibraryDocumentDto,
    context: RequestContext,
  ): Promise<LibraryDocumentEntity> {
    const { documents, folders } = this.deps;
    const workspaceId = requireWorkspace(context);
    const document = await resolveVisibleDocument(documents, context, documentId);

    const movedTo = dto.folder_id !== undefined ? await loadVisibleFolder(folders, context, dto.folder_id) : undefined;
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

    // Who can use it (ADR-0033). Choosing scopes is an override; "same as the
    // collection" and moving a document that already follows its collection
    // both take the (new) collection's access.
    let nextScopes: ScopeRef[] | null = null;
    if (dto.scopes) {
      nextScopes = await resolveScopesChecked(this.deps, dto.scopes, context);
      patch.access_inherited = false;
    } else if (dto.inherit_access) {
      const collection = movedTo !== undefined ? movedTo : await loadVisibleFolder(folders, context, document.folder_id);
      nextScopes = inheritedScopes(collection, context);
      patch.access_inherited = true;
    } else if (movedTo !== undefined && document.access_inherited && dto.folder_id !== document.folder_id) {
      nextScopes = inheritedScopes(movedTo, context);
    }

    if (nextScopes === null) {
      return Object.keys(patch).length > 0 ? documents.update(workspaceId, document.id, patch) : document;
    }
    return applyDocumentScopes(this.deps, context, document, nextScopes, patch);
  }
}
