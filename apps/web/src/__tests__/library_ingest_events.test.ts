import { describe, expect, it } from 'vitest';
import { IngestEventSchema, type IngestUpdate } from '@/server/application/library/ingest_event_dto';
import { ApplyIngestEventUseCase } from '@/server/application/use-cases/library/apply_ingest_event_use_case';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { OTHER_WS, WS, buildHarness, uploadAndComplete, type LibraryHarness } from './library_harness';

const EVENT_BASE = (documentId: string, jobId: string, over: Partial<IngestUpdate> = {}): IngestUpdate => ({
  event_id: '10000000-0000-4000-8000-000000000001',
  tenant_id: WS,
  document_id: documentId,
  job_id: jobId,
  sequence: 1,
  stage: 'parsing',
  status: 'processing',
  occurred_at: '2026-10-22T10:05:00.000Z',
  progress: null,
  reason_code: null,
  pages: [],
  page_count: null,
  chunk_count: null,
  language: null,
  embedding_model: null,
  ocr_pages: null,
  personal_data_hint: false,
  ...over,
});

let counter = 1;
const eventId = () => `10000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

async function setup(h: LibraryHarness = buildHarness()) {
  const doc = await uploadAndComplete(h);
  return { h, doc, jobId: doc.ingest_job_id!, apply: new ApplyIngestEventUseCase(h.deps) };
}

describe('ingest events drive the document status (WP-M1-32 task 4)', () => {
  it('moves queued to processing with progress, then to ready with counts, and audits indexed once', async () => {
    const { h, doc, jobId, apply } = await setup();
    h.audit.clear();

    await apply.execute(
      EVENT_BASE(doc.id, jobId, { event_id: eventId(), sequence: 1, progress: { current: 12, total: 40 } }),
      'req-1',
    );
    let stored = await h.documents.findById(WS, doc.id);
    expect(stored).toMatchObject({ status: 'processing', status_detail: { progress: { current: 12, total: 40 } } });

    const result = await apply.execute(
      EVENT_BASE(doc.id, jobId, {
        event_id: eventId(),
        sequence: 2,
        stage: 'completed',
        status: 'ready',
        page_count: 40,
        chunk_count: 96,
        language: 'id',
        embedding_model: 'bge-m3',
        ocr_pages: 6,
      }),
      'req-1',
    );
    expect(result).toEqual({ applied: true, duplicate: false });
    stored = await h.documents.findById(WS, doc.id);
    expect(stored).toMatchObject({
      status: 'ready',
      status_detail: null,
      page_count: 40,
      chunk_count: 96,
      language: 'id',
      embedding_model: 'bge-m3',
      ocr_page_count: 6,
    });
    expect(stored?.last_indexed_at).toBe('2026-10-22T10:05:00.000Z');

    const audit = h.audit.getEvents();
    expect(audit.map((e) => e.action)).toEqual(['library.document.indexed']);
    expect(audit[0]).toMatchObject({
      workspace_id: WS,
      target_resource_id: doc.id,
      context: { actor: { type: 'system', id: 'sineva-ai' } },
    });
  });

  it('ignores an older sequence after a newer one, stores it as not applied, and keeps the status', async () => {
    const { h, doc, jobId, apply } = await setup();
    await apply.execute(EVENT_BASE(doc.id, jobId, { event_id: eventId(), sequence: 3, status: 'ready', stage: 'completed', chunk_count: 5, page_count: 2 }), 'r');
    const late = await apply.execute(EVENT_BASE(doc.id, jobId, { event_id: eventId(), sequence: 2, status: 'processing' }), 'r');
    expect(late).toEqual({ applied: false, duplicate: false });
    expect((await h.documents.findById(WS, doc.id))?.status).toBe('ready');
    const stored = h.events.rows.filter((row) => row.sequence === 2);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.applied).toBe(false);
    expect(h.log.entries.map((e) => e.event)).toContain('library.ingest_event_ignored');
  });

  it('treats a retried callback (same event_id) as a duplicate and applies nothing twice', async () => {
    const { h, doc, jobId, apply } = await setup();
    const id = eventId();
    const ready = EVENT_BASE(doc.id, jobId, { event_id: id, sequence: 1, status: 'ready', stage: 'completed', chunk_count: 4, page_count: 1 });
    await apply.execute(ready, 'r');
    h.audit.clear();
    const again = await apply.execute(ready, 'r');
    expect(again).toEqual({ applied: false, duplicate: true });
    expect(h.audit.getEvents()).toEqual([]);
    expect(h.events.rows.filter((row) => row.event_id === id)).toHaveLength(1);
  });

  it('ignores an event for an old job after a reindex started a new one', async () => {
    const { h, doc, jobId, apply } = await setup();
    await h.documents.update(WS, doc.id, { ingest_job_id: '99999999-9999-4999-8999-999999999999', last_ingest_sequence: 0 });
    const result = await apply.execute(EVENT_BASE(doc.id, jobId, { event_id: eventId(), sequence: 5, status: 'ready', stage: 'completed' }), 'r');
    expect(result.applied).toBe(false);
    expect((await h.documents.findById(WS, doc.id))?.status).toBe('queued');
  });

  it('lets a new job start again from sequence 1 after the previous one finished', async () => {
    const { h, doc, jobId, apply } = await setup();
    await apply.execute(EVENT_BASE(doc.id, jobId, { event_id: eventId(), sequence: 4, status: 'ready', stage: 'completed', chunk_count: 1, page_count: 1 }), 'r');
    const next = '88888888-8888-4888-8888-888888888888';
    await h.documents.update(WS, doc.id, { ingest_job_id: next, last_ingest_sequence: 0, status: 'queued' });
    const result = await apply.execute(EVENT_BASE(doc.id, next, { event_id: eventId(), sequence: 1, status: 'processing' }), 'r');
    expect(result.applied).toBe(true);
    expect((await h.documents.findById(WS, doc.id))?.status).toBe('processing');
  });

  it('marks needs_attention with the page numbers and the reason code, and audits it as failed (FR-LIB-08)', async () => {
    const { h, doc, jobId, apply } = await setup();
    h.audit.clear();
    await apply.execute(
      EVENT_BASE(doc.id, jobId, {
        event_id: eventId(),
        sequence: 2,
        stage: 'ocr',
        status: 'needs_attention',
        reason_code: 'unreadable_pages',
        pages: [3, 7],
        page_count: 10,
        personal_data_hint: true,
      }),
      'r',
    );
    const stored = await h.documents.findById(WS, doc.id);
    expect(stored).toMatchObject({
      status: 'needs_attention',
      status_detail: { reason_code: 'unreadable_pages', pages: [3, 7], personal_data_hint: true },
    });
    expect(h.audit.getEvents()[0]).toMatchObject({
      action: 'library.document.failed',
      reason_code: 'unreadable_pages',
      metadata: { status: 'needs_attention', flagged_page_count: 2 },
    });
  });

  it('marks failed with an error outcome in the audit row', async () => {
    const { h, doc, jobId, apply } = await setup();
    h.audit.clear();
    await apply.execute(
      EVENT_BASE(doc.id, jobId, { event_id: eventId(), sequence: 2, stage: 'failed', status: 'failed', reason_code: 'password_protected' }),
      'r',
    );
    expect(h.audit.getEvents()[0]).toMatchObject({ action: 'library.document.failed', outcome: 'error', reason_code: 'password_protected' });
    expect((await h.documents.findById(WS, doc.id))?.status_detail).toMatchObject({ reason_code: 'password_protected' });
  });

  it('keeps the personal data hint across later events', async () => {
    const { h, doc, jobId, apply } = await setup();
    await apply.execute(EVENT_BASE(doc.id, jobId, { event_id: eventId(), sequence: 1, personal_data_hint: true }), 'r');
    await apply.execute(EVENT_BASE(doc.id, jobId, { event_id: eventId(), sequence: 2, status: 'ready', stage: 'completed', chunk_count: 2, page_count: 1 }), 'r');
    expect((await h.documents.findById(WS, doc.id))?.status_detail).toEqual({ personal_data_hint: true });
  });

  it('re-arms the review reminder when a document is read again', async () => {
    const { h, doc, jobId, apply } = await setup();
    await h.documents.update(WS, doc.id, { review_interval_days: 30, review_due_at: new Date('2026-01-01'), review_reminded_at: new Date('2026-01-02') });
    await apply.execute(EVENT_BASE(doc.id, jobId, { event_id: eventId(), sequence: 1, status: 'ready', stage: 'completed', chunk_count: 1, page_count: 1 }), 'r');
    const stored = await h.documents.findById(WS, doc.id);
    expect(stored?.review_due_at).toBe('2026-11-21T10:00:00.000Z');
    expect(stored?.review_reminded_at).toBeNull();
  });

  it('answers 404 when the tenant does not own the document, so a forged tenant id cannot touch another workspace', async () => {
    const { h, doc, jobId, apply } = await setup();
    await expect(
      apply.execute(EVENT_BASE(doc.id, jobId, { tenant_id: OTHER_WS, event_id: eventId() }), 'r'),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await h.documents.findById(WS, doc.id))?.status).toBe('queued');
  });

  it('stores but never applies an event for a document that is being deleted', async () => {
    const { h, doc, jobId, apply } = await setup();
    await h.documents.update(WS, doc.id, { status: 'deleting' });
    const result = await apply.execute(EVENT_BASE(doc.id, jobId, { event_id: eventId(), sequence: 9, status: 'ready', stage: 'completed' }), 'r');
    expect(result.applied).toBe(false);
    expect((await h.documents.findById(WS, doc.id))?.status).toBe('deleting');
    expect(h.events.rows.at(-1)?.applied).toBe(false);
  });
});

describe('IngestEventSchema (the internal body)', () => {
  const valid = {
    event_id: '10000000-0000-4000-8000-000000000001',
    tenant_id: WS,
    document_id: '20000000-0000-4000-8000-000000000001',
    job_id: '30000000-0000-4000-8000-000000000001',
    sequence: 1,
    stage: 'parsing',
    status: 'processing',
    occurred_at: '2026-10-22T10:05:00.000Z',
  };

  it('accepts the minimal event and fills the defaults', () => {
    const parsed = IngestEventSchema.parse(valid);
    expect(parsed.pages).toEqual([]);
    expect(parsed.personal_data_hint).toBe(false);
  });

  it.each([
    ['an unknown stage', { stage: 'thinking' }],
    ['a queued status (the platform owns queued)', { status: 'queued' }],
    ['a zero sequence', { sequence: 0 }],
    ['a non-uuid document id', { document_id: 'x' }],
    ['a field the platform assigns', { applied: true }],
    ['a free-text field', { message: 'page 3 says Budi 3171234567890001' }],
    ['a reason code with spaces', { reason_code: 'bad reason' }],
  ])('rejects %s', (_label, extra) => {
    expect(IngestEventSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
  });
});
