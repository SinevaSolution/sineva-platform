import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IngestEventSchema } from '@/server/application/library/ingest_event_dto';
import { UpstreamServiceError, UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import {
  aclUpdateReportSchema,
  deleteReportSchema,
  envelope,
  ingestAcceptedSchema,
  ingestStatusSchema,
  searchResultSchema,
  textPreviewSchema,
} from '@/server/infrastructure/gateways/knowledge_schemas';
import { InternalKnowledgeGateway } from '@/server/infrastructure/gateways/internal_knowledge_gateway';
import aclRequest from './fixtures/library_acl_update_request.json';
import aclResponse from './fixtures/library_acl_update_response.json';
import deleteResponse from './fixtures/library_delete_response.json';
import deleteStray from './fixtures/library_delete_response_stray_vector.json';
import errorContext from './fixtures/library_error_context_mismatch.json';
import eventFailed from './fixtures/library_ingest_event_failed.json';
import eventNeedsAttention from './fixtures/library_ingest_event_needs_attention.json';
import eventProcessing from './fixtures/library_ingest_event_processing.json';
import eventReady from './fixtures/library_ingest_event_ready.json';
import ingestAccepted from './fixtures/library_ingest_accepted.json';
import ingestRequest from './fixtures/library_ingest_request.json';
import ingestStatus from './fixtures/library_ingest_status.json';
import ingestStatusNeedsAttention from './fixtures/library_ingest_status_needs_attention.json';
import reindexRequest from './fixtures/library_reindex_request.json';
import searchAbstained from './fixtures/library_search_response_abstained.json';
import searchRequest from './fixtures/library_search_request.json';
import searchResponse from './fixtures/library_search_response.json';
import textPreview from './fixtures/library_text_preview_response.json';

// Contract proposed by the platform, pending sineva-ai (ADR-0030). The fixtures
// are the contract: sineva-ai is expected to answer exactly these shapes. The
// fake upstream below answers from them, so the platform is tested against the
// contract and not against an invented stand-in.

const AI_URL = 'http://sineva-ai.test:8000';
const AI_KEY = 'test_internal_key';
const CALL = { context_token: 'test.signed.jws', request_id: 'req-library-1' };
const TENANT = ingestRequest.tenant_id;
const DOC = ingestRequest.document_id;
const JOB = ingestRequest.job_id;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Recorded = { url: URL; method: string; headers: Headers; body: unknown };

/** Answers one call with `respond` and records what the platform sent. */
function fakeUpstream(respond: (call: Recorded) => Response | Promise<Response>) {
  const calls: Recorded[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call: Recorded = {
        url: new URL(url),
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      return respond(call);
    }),
  );
  return calls;
}

describe('library contract fixtures are valid (proposed by the platform, pending sineva-ai)', () => {
  it.each([
    ['library_ingest_event_processing', eventProcessing],
    ['library_ingest_event_ready', eventReady],
    ['library_ingest_event_needs_attention', eventNeedsAttention],
    ['library_ingest_event_failed', eventFailed],
  ])('%s parses with the internal events schema', (_name, fixture) => {
    expect(IngestEventSchema.safeParse(fixture).success).toBe(true);
  });

  it.each([
    ['library_ingest_accepted', ingestAccepted, ingestAcceptedSchema],
    ['library_ingest_status', ingestStatus, ingestStatusSchema],
    ['library_ingest_status_needs_attention', ingestStatusNeedsAttention, ingestStatusSchema],
    ['library_acl_update_response', aclResponse, aclUpdateReportSchema],
    ['library_delete_response', deleteResponse, deleteReportSchema],
    ['library_delete_response_stray_vector', deleteStray, deleteReportSchema],
    ['library_search_response', searchResponse, searchResultSchema],
    ['library_search_response_abstained', searchAbstained, searchResultSchema],
    ['library_text_preview_response', textPreview, textPreviewSchema],
  ])('%s parses inside the success envelope', (_name, fixture, schema) => {
    expect(envelope(schema).safeParse(fixture).success).toBe(true);
  });

  it('carries no similarity score anywhere (fused scores are not cosine-like)', () => {
    expect(JSON.stringify(searchResponse)).not.toMatch(/score/);
  });
});

describe('InternalKnowledgeGateway against the fixtures', () => {
  beforeEach(() => {
    vi.stubEnv('AI_ENGINE_INTERNAL_URL', AI_URL);
    vi.stubEnv('AI_ENGINE_INTERNAL_API_KEY', AI_KEY);
    vi.stubEnv('AI_ENGINE_TIMEOUT_MS', '15000');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  const gateway = () => new InternalKnowledgeGateway();

  it('requestIngest posts the fixture request with the internal key, context and request id', async () => {
    const calls = fakeUpstream(() => json(ingestAccepted, 202));
    const result = await gateway().requestIngest(ingestRequest, CALL);

    expect(result).toEqual({ job_id: JOB, status: 'queued' });
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url.href).toBe(`${AI_URL}/api/v1/knowledge/documents`);
    expect(calls[0]?.body).toEqual(ingestRequest);
    expect(calls[0]?.headers.get('x-internal-api-key')).toBe(AI_KEY);
    expect(calls[0]?.headers.get('x-sineva-context')).toBe(CALL.context_token);
    expect(calls[0]?.headers.get('x-request-id')).toBe(CALL.request_id);
  });

  it('getIngestStatus reads the job with the tenant in the query', async () => {
    const calls = fakeUpstream(() => json(ingestStatus));
    const status = await gateway().getIngestStatus(JOB, TENANT, CALL);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url.pathname).toBe(`/api/v1/knowledge/ingest/${JOB}`);
    expect(calls[0]?.url.searchParams.get('tenant_id')).toBe(TENANT);
    expect(status).toMatchObject({ job_id: JOB, status: 'processing', sequence: 3, progress: { current: 12, total: 40 } });
  });

  it('requestReindex posts to the document reindex path', async () => {
    const calls = fakeUpstream(() => json(ingestAccepted, 202));
    await gateway().requestReindex(reindexRequest as Parameters<InternalKnowledgeGateway['requestReindex']>[0], CALL);
    expect(calls[0]?.url.pathname).toBe(`/api/v1/knowledge/documents/${DOC}/reindex`);
    expect(calls[0]?.body).toEqual(reindexRequest);
  });

  it('updateAcl puts the principals and gets a relabel report that never re-embeds', async () => {
    const calls = fakeUpstream(() => json(aclResponse));
    const report = await gateway().updateAcl(aclRequest, CALL);
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.url.pathname).toBe(`/api/v1/knowledge/documents/${DOC}/acl`);
    expect(calls[0]?.body).toEqual(aclRequest);
    expect(report).toMatchObject({ chunks_updated: 96, re_embedded: false });
  });

  it('deleteDocument sends DELETE with the tenant and returns the verification counts', async () => {
    const calls = fakeUpstream(() => json(deleteResponse));
    const report = await gateway().deleteDocument(TENANT, DOC, CALL);
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.url.pathname).toBe(`/api/v1/knowledge/documents/${DOC}`);
    expect(calls[0]?.url.searchParams.get('tenant_id')).toBe(TENANT);
    expect(report).toMatchObject({ verified: true, vectors_remaining: 0, vectors_deleted: 96 });
  });

  it('returns a stray-vector delete report unchanged: judging it is the use case job', async () => {
    fakeUpstream(() => json(deleteStray));
    expect(await gateway().deleteDocument(TENANT, DOC, CALL)).toMatchObject({ verified: false, vectors_remaining: 1 });
  });

  it('search posts the platform-computed principals and parses hits and abstention', async () => {
    const calls = fakeUpstream(() => json(searchResponse));
    const result = await gateway().search(searchRequest, CALL);
    expect(calls[0]?.url.pathname).toBe('/api/v1/knowledge/search');
    expect(calls[0]?.body).toEqual(searchRequest);
    expect(result.results[0]).toMatchObject({ page: 2, section_path: 'Daftar harga > Minuman' });

    fakeUpstream(() => json(searchAbstained));
    expect(await gateway().search(searchRequest, CALL)).toMatchObject({ abstained: true, results: [] });
  });

  it('getText asks for a page window', async () => {
    const calls = fakeUpstream(() => json(textPreview));
    const preview = await gateway().getText({ tenant_id: TENANT, document_id: DOC, page_from: 1, page_to: 20 }, CALL);
    expect(calls[0]?.url.pathname).toBe(`/api/v1/knowledge/documents/${DOC}/text`);
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({ tenant_id: TENANT, page_from: '1', page_to: '20' });
    expect(preview.pages[1]).toMatchObject({ page: 3, readable: false });
    expect(preview.next_page).toBe(4);
  });

  it('an unreachable sineva-ai is a 503 (ADR-0016)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(gateway().requestIngest(ingestRequest, CALL)).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('a timeout is a 503', async () => {
    // The config is cached after its first read, so the 15 s of beforeEach applies.
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })),
    );
    const pending = gateway().search(searchRequest, CALL).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toBeInstanceOf(UpstreamUnavailableError);
    vi.useRealTimers();
  });

  it('a non-2xx answer is a 502 and carries only a safe machine code, never upstream text', async () => {
    fakeUpstream(() => json(errorContext, 403));
    const error = await gateway().requestIngest(ingestRequest, CALL).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamServiceError);
    expect((error as UpstreamServiceError).status).toBe(502);
    expect((error as UpstreamServiceError).code).toBe('context_mismatch');
    expect((error as UpstreamServiceError).message).not.toContain('tenant_id differs');
  });

  it('a body that is not JSON, or does not match the contract, is a 502', async () => {
    fakeUpstream(() => new Response('<html>oops</html>', { status: 200 }));
    await expect(gateway().deleteDocument(TENANT, DOC, CALL)).rejects.toBeInstanceOf(UpstreamServiceError);

    fakeUpstream(() => json({ success: true, status_code: 200, message: 'OK', data: { job_id: 'not-a-uuid', status: 'ready' } }));
    await expect(gateway().requestIngest(ingestRequest, CALL)).rejects.toBeInstanceOf(UpstreamServiceError);
  });

  it('refuses a delete report that names another document', async () => {
    fakeUpstream(() => json({ ...deleteResponse, data: { ...deleteResponse.data, document_id: '99999999-9999-4999-8999-999999999999' } }));
    await expect(gateway().deleteDocument(TENANT, DOC, CALL)).rejects.toBeInstanceOf(UpstreamServiceError);
  });
});
