import {
  mintCall,
  requireWorkspace,
  resolveVisibleDocument,
  type LibraryDeps,
} from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { UpstreamServiceError } from '@/server/domain/errors/domain_error';
import type { DeleteReport } from '@/server/domain/library/knowledge_ingest_gateway';

export interface DeleteLibraryDocumentResult {
  id: string;
  deleted: true;
  chunks_deleted: number;
  vectors_deleted: number;
}

/**
 * Delete means the file, the extracted text, the chunks and the vectors are
 * gone, and the document disappears from search (FR-LIB-25). Order matters:
 *
 * 1. mark `deleting` (hidden from lists and retrieval, not reversible);
 * 2. have sineva-ai delete and prove it (`verified` and no vector remaining);
 * 3. delete the original file;
 * 4. only then remove the rows, with the audit row in the same transaction.
 *
 * Any step that fails leaves the document in `deleting` and the request fails
 * with a typed error; calling DELETE again resumes. The rows go last on
 * purpose: if they went first, a vector left behind would have no document to
 * point at and nothing to retry from.
 */
export class DeleteLibraryDocumentUseCase {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(documentId: string, context: RequestContext): Promise<DeleteLibraryDocumentResult> {
    const { documents, events, store, gateway, audit, transactions, log } = this.deps;
    const workspaceId = requireWorkspace(context);
    const document = await resolveVisibleDocument(documents, context, documentId, { allowDeleting: true });

    if (document.status !== 'deleting') {
      await documents.update(workspaceId, document.id, { status: 'deleting' });
      await events.append({
        document_id: document.id,
        workspace_id: workspaceId,
        event_id: null,
        job_id: document.ingest_job_id,
        sequence: null,
        stage: 'delete_requested',
        outcome: 'accepted',
        status: 'deleting',
        detail: null,
        applied: true,
      });
    }

    // A document that was never handed to sineva-ai has nothing there. One
    // that was attempted (even if the call timed out) may have chunks.
    let report: DeleteReport = {
      document_id: document.id,
      files_deleted: 0,
      text_deleted: false,
      chunks_deleted: 0,
      vectors_deleted: 0,
      vectors_remaining: 0,
      verified: true,
    };
    if (document.ingest_attempted_at !== null) {
      report = await gateway.deleteDocument(workspaceId, document.id, await mintCall(this.deps, context));
      // Both conditions: an answer that says "verified" while still counting
      // vectors is not trusted.
      if (!report.verified || report.vectors_remaining > 0) {
        log.warn('library.delete_unverified', {
          workspace_id: workspaceId,
          document_id: document.id,
          count: report.vectors_remaining,
        });
        throw new UpstreamServiceError(
          'The vector store could not confirm that the document is gone',
          'delete_unverified',
        );
      }
    }

    if (document.storage_key) {
      await store.deleteObject(document.storage_key);
    }

    await transactions.run(async () => {
      await audit.log({
        action: 'library.document.deleted',
        context,
        target_resource_type: 'library_document',
        target_resource_id: document.id,
        metadata: {
          source_type: document.source_type,
          byte_size: document.byte_size,
          chunks_deleted: report.chunks_deleted,
          vectors_deleted: report.vectors_deleted,
          vectors_remaining: report.vectors_remaining,
          files_deleted: report.files_deleted,
        },
      });
      // Scopes and ingest events go with it through ON DELETE CASCADE.
      await documents.delete(workspaceId, document.id);
    });

    return {
      id: document.id,
      deleted: true,
      chunks_deleted: report.chunks_deleted,
      vectors_deleted: report.vectors_deleted,
    };
  }
}
