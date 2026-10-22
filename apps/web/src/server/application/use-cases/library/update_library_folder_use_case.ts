import type { UpdateLibraryFolderDto } from '@/server/application/dtos/library_dto';
import { assertFolderExists, requireWorkspace, type LibraryDeps } from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import {
  LIBRARY_MAX_FOLDER_DEPTH,
  folderDepthAfterMove,
  wouldCreateFolderCycle,
} from '@/server/domain/library/library';
import { libraryValidation } from '@/server/domain/library/library_errors';
import type { LibraryFolderEntity } from '@/server/domain/library/library_entities';

export class UpdateLibraryFolderUseCase {
  constructor(private readonly deps: Pick<LibraryDeps, 'folders'>) {}

  async execute(folderId: string, dto: UpdateLibraryFolderDto, context: RequestContext): Promise<LibraryFolderEntity> {
    const { folders } = this.deps;
    const workspaceId = requireWorkspace(context);
    const folder = await folders.findById(workspaceId, folderId);
    if (!folder) {
      throw new NotFoundError('Library folder', folderId);
    }

    const patch: { name?: string; parent_id?: string | null } = {};
    if (dto.name !== undefined) {
      patch.name = dto.name;
    }
    if (dto.parent_id !== undefined && dto.parent_id !== folder.parent_id) {
      await assertFolderExists(folders, workspaceId, dto.parent_id);
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
    if (Object.keys(patch).length === 0) {
      return folder;
    }
    return folders.update(workspaceId, folder.id, patch);
  }
}
