import { requireWorkspace, type LibraryDeps } from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { LibraryFolderEntity } from '@/server/domain/library/library_entities';

export class ListLibraryFoldersUseCase {
  constructor(private readonly deps: Pick<LibraryDeps, 'folders'>) {}

  /** The whole tree as a flat list: folders are few, and the client builds the tree. */
  async execute(context: RequestContext): Promise<{ items: LibraryFolderEntity[] }> {
    return { items: await this.deps.folders.listAll(requireWorkspace(context)) };
  }
}
