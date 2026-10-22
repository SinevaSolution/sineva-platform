import { resolveVisibleDocument, type LibraryDeps } from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { LibraryDocumentEntity } from '@/server/domain/library/library_entities';

export class GetLibraryDocumentUseCase {
  constructor(private readonly deps: Pick<LibraryDeps, 'documents'>) {}

  async execute(documentId: string, context: RequestContext): Promise<LibraryDocumentEntity> {
    return resolveVisibleDocument(this.deps.documents, context, documentId);
  }
}
