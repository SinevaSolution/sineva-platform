import type { PreviewLibraryDocumentQueryDto } from '@/server/application/dtos/library_dto';
import {
  mintCall,
  requireWorkspace,
  resolveVisibleDocument,
  type LibraryDeps,
} from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { TextPreview } from '@/server/domain/library/knowledge_ingest_gateway';
import type { LibraryStatus } from '@/server/domain/library/library';
import { LibraryStateError } from '@/server/domain/library/library_errors';

export interface LibraryPreview extends TextPreview {
  status: LibraryStatus;
}

// Shows what sineva-ai extracted so a person can check an OCR result
// (FR-LIB-08). The text is the person's own document, returned to a caller who
// passed the same access check as the document itself, and is never logged.
export class PreviewLibraryDocumentUseCase {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(
    documentId: string,
    query: PreviewLibraryDocumentQueryDto,
    context: RequestContext,
  ): Promise<LibraryPreview> {
    const workspaceId = requireWorkspace(context);
    const document = await resolveVisibleDocument(this.deps.documents, context, documentId);
    // `needs_attention` is exactly when a person wants to look at the text.
    if (document.status !== 'ready' && document.status !== 'needs_attention') {
      throw new LibraryStateError('preview_not_ready', 'The document has not been read yet');
    }
    const preview = await this.deps.gateway.getText(
      { tenant_id: workspaceId, document_id: document.id, page_from: query.page_from, page_to: query.page_to },
      await mintCall(this.deps, context),
    );
    return { ...preview, status: document.status };
  }
}
