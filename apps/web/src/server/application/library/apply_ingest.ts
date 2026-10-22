import type { IngestUpdate } from '@/server/application/library/ingest_event_dto';
import type { LibraryDeps } from '@/server/application/library/library_support';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { reviewDueAt } from '@/server/domain/library/library';
import type { LibraryDocumentEntity, LibraryStatusDetail } from '@/server/domain/library/library_entities';
import type { LibraryDocumentPatch } from '@/server/domain/repositories/library_repository';
import type { AuditEvent } from '@/server/domain/audit/audit_logger';

export interface ApplyResult {
  applied: boolean;
  /** The same `event_id` was already stored: a retried callback. */
  duplicate: boolean;
}

function statusDetailFor(update: IngestUpdate, document: LibraryDocumentEntity): LibraryStatusDetail | null {
  const detail: LibraryStatusDetail = {};
  if (update.status === 'processing' && update.progress) {
    detail.progress = update.progress;
  }
  if (update.status === 'needs_attention' || update.status === 'failed') {
    if (update.reason_code) detail.reason_code = update.reason_code;
    if (update.pages.length > 0) detail.pages = update.pages;
  }
  // The hint is sticky: once a document looked like personal data it keeps the note.
  if (update.personal_data_hint || document.status_detail?.personal_data_hint) {
    detail.personal_data_hint = true;
  }
  return Object.keys(detail).length > 0 ? detail : null;
}

// Built without undefined keys on purpose: an absent field means "leave as is".
function patchFor(update: IngestUpdate, document: LibraryDocumentEntity, now: Date): LibraryDocumentPatch {
  const patch: LibraryDocumentPatch = {
    status: update.status,
    status_detail: statusDetailFor(update, document),
  };
  if (update.page_count !== null) patch.page_count = update.page_count;
  if (update.language !== null) patch.language = update.language;
  if (update.status === 'ready') {
    patch.chunk_count = update.chunk_count ?? 0;
    patch.ocr_page_count = update.ocr_pages ?? 0;
    patch.last_indexed_at = new Date(update.occurred_at);
    if (update.embedding_model !== null) patch.embedding_model = update.embedding_model;
    if (document.review_interval_days !== null) {
      // The interval counts from the moment the document was last read, and a
      // fresh reading re-arms the reminder.
      patch.review_due_at = reviewDueAt(now, document.review_interval_days);
      patch.review_reminded_at = null;
    }
  }
  return patch;
}

function eventDetail(update: IngestUpdate): Record<string, unknown> | null {
  const detail: Record<string, unknown> = {};
  if (update.reason_code) detail.reason_code = update.reason_code;
  if (update.pages.length > 0) detail.pages = update.pages;
  if (update.progress) detail.progress = update.progress;
  if (update.page_count !== null) detail.page_count = update.page_count;
  if (update.chunk_count !== null) detail.chunk_count = update.chunk_count;
  if (update.ocr_pages !== null) detail.ocr_pages = update.ocr_pages;
  return Object.keys(detail).length > 0 ? detail : null;
}

function outcomeFor(status: IngestUpdate['status']): string {
  switch (status) {
    case 'processing':
      return 'progress';
    case 'ready':
      return 'succeeded';
    case 'needs_attention':
      return 'flagged';
    case 'failed':
      return 'failed';
  }
}

function auditFor(update: IngestUpdate, document: LibraryDocumentEntity, requestId: string): AuditEvent | null {
  if (update.status === 'processing') {
    return null;
  }
  const base = {
    // sineva-ai holds the internal key but no user session: the row says so.
    context: {
      user_id: 'system:sineva-ai',
      session_id: 'internal',
      request_id: requestId,
      actor: { type: 'system' as const, id: 'sineva-ai' },
    },
    workspace_id: document.workspace_id,
    target_resource_type: 'library_document',
    target_resource_id: document.id,
  };
  if (update.status === 'ready') {
    return {
      ...base,
      action: 'library.document.indexed',
      metadata: {
        page_count: update.page_count,
        chunk_count: update.chunk_count,
        ocr_pages: update.ocr_pages,
        language: update.language,
        embedding_model: update.embedding_model,
      },
    };
  }
  return {
    ...base,
    action: 'library.document.failed',
    outcome: update.status === 'failed' ? 'error' : 'allowed',
    ...(update.reason_code ? { reason_code: update.reason_code } : {}),
    metadata: { status: update.status, page_count: update.page_count, flagged_page_count: update.pages.length },
  };
}

/**
 * The one place an ingest result changes a document, whether it arrived as a
 * callback or as a poll answer. The write is a compare-and-set on the job and
 * the sequence, so a late or repeated event cannot move the status backwards,
 * and the audit row commits with the status it describes. An event that does
 * not apply is still stored (`applied = false`), because the history of what
 * sineva-ai said is the evidence when a status looks wrong.
 */
export async function applyIngestUpdate(
  deps: LibraryDeps,
  update: IngestUpdate,
  requestId: string,
): Promise<ApplyResult> {
  const { documents, events, audit, transactions, log } = deps;
  const document = await documents.findById(update.tenant_id, update.document_id);
  // A document of another workspace is "not found", so a forged tenant id
  // cannot probe or change a row it does not own.
  if (!document || document.uploaded_at === null) {
    throw new NotFoundError('Library document', update.document_id);
  }

  const record = (applied: boolean) =>
    events.append({
      document_id: document.id,
      workspace_id: document.workspace_id,
      event_id: update.event_id,
      job_id: update.job_id,
      sequence: update.sequence,
      stage: update.stage,
      outcome: outcomeFor(update.status),
      status: update.status,
      detail: eventDetail(update),
      applied,
    });

  if (document.status === 'deleting') {
    // A document on its way out must not come back to life.
    const stored = await record(false);
    return { applied: false, duplicate: !stored.inserted };
  }

  return transactions.run(async () => {
    const updated = await documents.applyIngestUpdate(
      document.workspace_id,
      document.id,
      update.job_id,
      update.sequence,
      patchFor(update, document, deps.now()),
    );
    const stored = await record(updated !== null);
    if (!updated) {
      if (stored.inserted) {
        log.warn('library.ingest_event_ignored', { workspace_id: document.workspace_id, document_id: document.id, reason: 'stale_or_other_job' });
      }
      return { applied: false, duplicate: !stored.inserted };
    }
    const auditEvent = auditFor(update, document, requestId);
    if (auditEvent) {
      await audit.log(auditEvent);
    }
    return { applied: true, duplicate: false };
  });
}
