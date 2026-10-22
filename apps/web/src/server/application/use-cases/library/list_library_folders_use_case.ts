import { requireWorkspace, type LibraryDeps } from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { canAccessScopes, documentAccessFor } from '@/server/domain/library/library_access';
import type { LibraryFolderEntity } from '@/server/domain/library/library_entities';

export class ListLibraryFoldersUseCase {
  constructor(private readonly deps: Pick<LibraryDeps, 'folders'>) {}

  /**
   * The whole tree as a flat list: folders are few, and the client builds the
   * tree. A member limited to some specialists gets only the collections whose
   * access includes Everyone or one of those specialists; a child whose parent
   * is hidden simply arrives without its parent, and the client shows it at
   * the top.
   */
  async execute(context: RequestContext): Promise<{ items: LibraryFolderEntity[] }> {
    const access = documentAccessFor(context);
    const all = await this.deps.folders.listAll(requireWorkspace(context));
    return { items: all.filter((folder) => canAccessScopes(access, folder.scopes)) };
  }
}
