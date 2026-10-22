import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/internal/v1/library/ingest-events/route';
import { ApplyIngestEventUseCase } from '@/server/application/use-cases/library/apply_ingest_event_use_case';
import * as container from '@/server/container';
import * as envModule from '@/server/infrastructure/config/env';
import { getOpenApiSpec } from '@/server/infrastructure/openapi/spec';
import eventProcessing from './contract/fixtures/library_ingest_event_processing.json';
import eventReady from './contract/fixtures/library_ingest_event_ready.json';
import { OTHER_WS, WS, buildHarness, uploadAndComplete, type LibraryHarness } from './library_harness';

const KEY = 'test-secret-key-primary';

function request(body: unknown, key: string | null = KEY) {
  return new NextRequest('http://localhost:3000/api/internal/v1/library/ingest-events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-internal-api-key': key } : {}) },
    body: JSON.stringify(body),
  });
}

describe('POST /api/internal/v1/library/ingest-events (WP-M1-32 task 4)', () => {
  let h: LibraryHarness;
  let documentId: string;
  let jobId: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    h = buildHarness();
    const doc = await uploadAndComplete(h);
    documentId = doc.id;
    jobId = doc.ingest_job_id!;
    vi.spyOn(container, 'getApplyIngestEventUseCase').mockReturnValue(new ApplyIngestEventUseCase(h.deps));
    vi.spyOn(envModule, 'getEnvConfig').mockReturnValue({
      ai_engine_internal_api_key: KEY,
      ai_engine_internal_api_key_next: 'test-secret-key-secondary',
    } as ReturnType<typeof envModule.getEnvConfig>);
  });

  const event = (over: Record<string, unknown> = {}) => ({
    ...eventProcessing,
    tenant_id: WS,
    document_id: documentId,
    job_id: jobId,
    ...over,
  });

  it('rejects a missing or wrong internal key with 401 and changes nothing', async () => {
    expect((await POST(request(event(), null))).status).toBe(401);
    expect((await POST(request(event(), 'wrong'))).status).toBe(401);
    expect((await h.documents.findById(WS, documentId))?.status).toBe('queued');
    expect(h.events.rows.filter((row) => row.event_id !== null)).toEqual([]);
  });

  it('applies the processing fixture and acknowledges it', async () => {
    const res = await POST(request(event()));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual({ applied: true, duplicate: false });
    expect(await h.documents.findById(WS, documentId)).toMatchObject({ status: 'processing', page_count: 40 });
  });

  it('applies the ready fixture and audits indexed', async () => {
    h.audit.clear();
    await POST(request(event({ ...eventReady, tenant_id: WS, document_id: documentId, job_id: jobId })));
    expect(await h.documents.findById(WS, documentId)).toMatchObject({ status: 'ready', chunk_count: 96, language: 'id' });
    expect(h.audit.getEvents().map((e) => e.action)).toEqual(['library.document.indexed']);
  });

  it('acknowledges a retried callback as a duplicate without applying it twice', async () => {
    await POST(request(event()));
    const again = await POST(request(event()));
    expect(again.status).toBe(200);
    expect((await again.json()).data).toEqual({ applied: false, duplicate: true });
  });

  it('acknowledges a stale event as not applied', async () => {
    await POST(request(event({ ...eventReady, tenant_id: WS, document_id: documentId, job_id: jobId })));
    const late = await POST(request(event({ event_id: '40000000-0000-4000-8000-0000000000aa', sequence: 1 })));
    expect((await late.json()).data).toEqual({ applied: false, duplicate: false });
    expect((await h.documents.findById(WS, documentId))?.status).toBe('ready');
  });

  it('answers 404 for a document that does not exist under the named tenant', async () => {
    expect((await POST(request(event({ tenant_id: OTHER_WS })))).status).toBe(404);
    expect((await POST(request(event({ document_id: '99999999-9999-4999-8999-999999999999' })))).status).toBe(404);
  });

  it.each([
    ['an unknown field', { applied: true }],
    ['a status the platform owns', { status: 'queued' }],
    ['a missing sequence', { sequence: undefined }],
  ])('answers 422 for %s', async (_label, extra) => {
    expect((await POST(request(event(extra)))).status).toBe(422);
  });

  it('is in the OpenAPI document', () => {
    const spec = getOpenApiSpec() as { paths: Record<string, Record<string, unknown>> };
    expect(spec.paths['/api/internal/v1/library/ingest-events']?.post).toBeDefined();
  });
});
