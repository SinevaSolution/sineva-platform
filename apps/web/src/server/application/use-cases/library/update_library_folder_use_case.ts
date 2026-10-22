import type { UpdateLibraryFolderDto } from '@/server/application/dtos/library_dto';
import {
  applyDocumentScopes,
  loadVisibleFolder,
  requireWorkspace,
  resolveScopes,
  type LibraryDeps,
} from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { DomainError } from '@/server/domain/errors/domain_error';
import {
  LIBRARY_MAX_FOLDER_DEPTH,
  folderDepthAfterMove,
  wouldCreateFolderCycle,
} from '@/server/domain/library/library';
import { principalsForScopes } from '@/server/domain/library/library_access';
import { libraryValidation } from '@/server/domain/library/library_errors';
import type { LibraryFolderEntity } from '@/server/domain/library/library_entities';

export class UpdateLibraryFolderUseCase {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(folderId: string, dto: UpdateLibraryFolderDto, context: RequestContext): Promise<LibraryFolderEntity> {
    const { folders, documents } = this.deps;
    const workspaceId = requireWorkspace(context);
    // Non-null: a missing id throws a 404 inside.
    const folder = (await loadVisibleFolder(folders, context, folderId))!;

    const patch: { name?: string; parent_id?: string | null } = {};
    if (dto.name !== undefined) {
      patch.name = dto.name;
    }
    if (dto.parent_id !== undefined && dto.parent_id !== folder.parent_id) {
      await loadVisibleFolder(folders, context, dto.parent_id);
      const all = await folders.listAll(workspaceId);
      if (dto.parent_id !== null && wouldCreateFolderCycle(all, folder.id, dto.parent_id)) {
        throw libraryValidation('folder_cycle', 'parent_id', 'A folder cannot move into itself or its own subfolders');
      }
      // The moved subtree keeps its shape, so its deepest folder lands at the
      // new parent's depth plus the subtree height.
      if (folderDepthAfterMove(all, dto.parent_id, folder.id) > LIBRARY_MAX_FOLDER_DEPTH) {
        throw libraryValidation('folder_depth_exceeded', 'parent_id', 'Folders can be nested three levels deep');
      }
      patch.parent_id = dto.parent_id;
    }

    const nextScopes = dto.scopes ? resolveScopes(dto.scopes, context) : null;
    const accessChanged =
      nextScopes !== null && principalsForScopes(nextScopes).join('|') !== principalsForScopes(folder.scopes).join('|');

    let result = folder;
    if (Object.keys(patch).length > 0) {
      result = await folders.update(workspaceId, folder.id, patch);
    }
    if (!accessChanged || !nextScopes) {
      return result;
    }

    await folders.replaceScopes(workspaceId, folder.id, nextScopes);
    result = { ...result, scopes: nextScopes };

    // Documents that follow the collection follow the change; those with their
    // own access do not. Each is a relabel, never a re-read. One that cannot be
    // relabelled right now stays flagged ("updating who can use this") and is
    // already logged; it must not stop the others or fail the collection change.
    for (const document of await documents.listInheriting(workspaceId, folder.id)) {
      if (document.status === 'deleting') {
        continue;
      }
      try {
        await applyDocumentScopes(this.deps, context, document, nextScopes);
      } catch (error) {
        if (!(error instanceof DomainError)) {
          throw error;
        }
      }
    }
    return result;
  }
}
