import type { CreateLibraryFolderDto } from '@/server/application/dtos/library_dto';
import {
  inheritedScopes,
  loadVisibleFolder,
  requireWorkspace,
  resolveScopes,
  type LibraryDeps,
} from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { LIBRARY_MAX_FOLDER_DEPTH, folderDepthAfterMove } from '@/server/domain/library/library';
import { libraryValidation } from '@/server/domain/library/library_errors';
import type { LibraryFolderEntity } from '@/server/domain/library/library_entities';

export class CreateLibraryFolderUseCase {
  constructor(private readonly deps: Pick<LibraryDeps, 'folders'>) {}

  async execute(dto: CreateLibraryFolderDto, context: RequestContext): Promise<LibraryFolderEntity> {
    const { folders } = this.deps;
    const workspaceId = requireWorkspace(context);
    const parentId = dto.parent_id ?? null;

    const parent = await loadVisibleFolder(folders, context, parentId);
    const all = await folders.listAll(workspaceId);
    if (folderDepthAfterMove(all, parentId, null) > LIBRARY_MAX_FOLDER_DEPTH) {
      throw libraryValidation('folder_depth_exceeded', 'parent_id', 'Folders can be nested three levels deep');
    }
    // A name taken under the same parent surfaces as a 409 from the repository,
    // which is the one place that can decide it atomically.
    // Access is the parent's unless chosen, Everyone at the top level (ADR-0033).
    // Sub-collections are independent afterwards: nothing here keeps them in step.
    const scopes = dto.scopes?.length ? resolveScopes(dto.scopes, context) : inheritedScopes(parent, context);
    return folders.create({
      workspace_id: workspaceId,
      parent_id: parentId,
      name: dto.name,
      created_by: context.user_id,
      scopes,
    });
  }
}
