import { applyIngestUpdate } from '@/server/application/library/apply_ingest';
import {
  INGEST_ERROR,
  INGEST_UNAVAILABLE,
  mintCall,
  monthStart,
  requireWorkspace,
  resolveVisibleDocument,
  startIngest,
  type LibraryDeps,
} from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ENTITLEMENT_KEYS } from '@/server/domain/entitlements/entitlements';
import { fileKindForContentType } from '@/server/domain/library/library';
import type { LibraryDocumentEntity } from '@/server/domain/library/library_entities';

function handOverFailed(document: LibraryDocumentEntity): boolean {
  const code = document.status_detail?.reason_code;
  return code === INGEST_UNAVAILABLE || code === INGEST_ERROR;
}

/**
 * "Reindex" is idempotent about running work. A document with a running job
 * gets a status refresh by polling sineva-ai (this is also how a lost callback
 * is repaired); otherwise a fresh job is requested, as a first ingest for a
 * document that was never read and as a reindex for one that was.
 */
export class ReindexLibraryDocumentUseCase {
  constructor(private readonly deps: LibraryDeps) {}

  async execute(documentId: string, context: RequestContext): Promise<LibraryDocumentEntity> {
    const { documents, gateway, audit, transactions, entitlements } = this.deps;
    const workspaceId = requireWorkspace(context);
    const document = await resolveVisibleDocument(documents, context, documentId);

    const running =
      document.ingest_job_id !== null &&
      (document.status === 'queued' || document.status === 'processing') &&
      !handOverFailed(document);
    if (running && document.ingest_job_id) {
      const snapshot = await gateway.getIngestStatus(document.ingest_job_id, workspaceId, await mintCall(this.deps, context));
      if (snapshot.status !== 'queued') {
        await applyIngestUpdate(
          this.deps,
          {
            event_id: null,
            tenant_id: workspaceId,
            document_id: document.id,
            job_id: document.ingest_job_id,
            sequence: snapshot.sequence,
            stage: snapshot.stage,
            status: snapshot.status,
            occurred_at: this.deps.now().toISOString(),
            progress: snapshot.progress,
            reason_code: snapshot.reason_code,
            pages: snapshot.pages,
            page_count: snapshot.page_count,
            chunk_count: snapshot.chunk_count,
            language: snapshot.language,
            embedding_model: snapshot.embedding_model,
            ocr_pages: snapshot.ocr_pages,
            personal_data_hint: snapshot.personal_data_hint,
          },
          context.request_id,
        );
      }
      return (await documents.findById(workspaceId, document.id)) ?? document;
    }

    // Reading again costs OCR pages for a document that can be scanned. The
    // check sits before the document is touched, so a hard limit leaves it as it was.
    const kind = fileKindForContentType(document.mime_type);
    if (kind === 'pdf' || kind === 'image') {
      const usage = await documents.usage(workspaceId, monthStart(this.deps.now()));
      await entitlements.assert(workspaceId, ENTITLEMENT_KEYS.OCR_PAGES, usage.ocr_pages_month + 1);
    }

    const wasIndexed = document.last_indexed_at !== null || document.chunk_count > 0;
    const { document: started, failure } = await startIngest(this.deps, document, context, wasIndexed ? 'reindex' : 'ingest');
    if (failure) {
      // The person asked for this explicitly, so they get the typed error. The
      // attempt is already recorded as an ingest event and the document is
      // still queued with the reason.
      throw failure;
    }
    if (wasIndexed) {
      await transactions.run(() =>
        audit.log({
          action: 'library.document.reindexed',
          context,
          target_resource_type: 'library_document',
          target_resource_id: document.id,
          metadata: { reason: 'manual' },
        }),
      );
    }
    return started;
  }
}
