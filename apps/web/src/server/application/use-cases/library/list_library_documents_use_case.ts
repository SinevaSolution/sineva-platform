import type { ListLibraryDocumentsQueryDto } from '@/server/application/dtos/library_dto';
import { requireWorkspace, type LibraryDeps } from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { documentAccessFor } from '@/server/domain/library/library_access';
import type { LibraryDocumentEntity } from '@/server/domain/library/library_entities';

export class ListLibraryDocumentsUseCase {
  constructor(private readonly deps: Pick<LibraryDeps, 'documents'>) {}

  async execute(
    query: Pick<ListLibraryDocumentsQueryDto, 'limit'> & Partial<ListLibraryDocumentsQueryDto>,
    context: RequestContext,
  ): Promise<{ items: LibraryDocumentEntity[]; next_cursor: string | null }> {
    return this.deps.documents.list({
      workspace_id: requireWorkspace(context),
      // From the session, so a member limited to some specialists never lists
      // the others' documents, whatever filter they send.
      access: documentAccessFor(context),
      ...(query.status ? { status: query.status } : {}),
      ...(query.scope_type ? { scope_type: query.scope_type } : {}),
      ...(query.scope_ref ? { scope_ref: query.scope_ref } : {}),
      ...(query.source_type ? { source_type: query.source_type } : {}),
      ...(query.language ? { language: query.language } : {}),
      ...(query.folder_id !== undefined ? { folder_id: query.folder_id === 'root' ? null : query.folder_id } : {}),
      ...(query.q ? { q: query.q } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      limit: query.limit,
    });
  }
}
