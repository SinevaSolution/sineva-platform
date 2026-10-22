import { requireWorkspace, type LibraryDeps } from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { FolderNotEmptyError } from '@/server/domain/library/library_errors';

export class DeleteLibraryFolderUseCase {
  constructor(private readonly deps: Pick<LibraryDeps, 'folders'>) {}

  /**
   * No silent cascade (FR-LIB-04): a folder with folders or documents inside
   * is refused, so a person decides where each of them goes first. The
   * database foreign keys are NO ACTION too, as the backstop for a race.
   */
  async execute(folderId: string, context: RequestContext): Promise<{ id: string; deleted: true }> {
    const { folders } = this.deps;
    const workspaceId = requireWorkspace(context);
    const folder = await folders.findById(workspaceId, folderId);
    if (!folder) {
      throw new NotFoundError('Library folder', folderId);
    }
    const counts = await folders.contentCounts(workspaceId, folder.id);
    if (counts.folders > 0 || counts.documents > 0) {
      throw new FolderNotEmptyError(counts);
    }
    await folders.delete(workspaceId, folder.id);
    return { id: folder.id, deleted: true };
  }
}
