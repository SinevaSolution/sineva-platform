import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpstreamServiceError, UpstreamUnavailableError, ContextInvalidError } from '@/server/domain/errors/domain_error';
import { InternalWebsiteScanGateway } from '@/server/infrastructure/gateways/internal_website_scan_gateway';
import scanRequestFixture from './fixtures/scan_request.json';
import scanResultFixture from './fixtures/scan_result.json';
import scanResultPartialFixture from './fixtures/scan_result_partial.json';
import scanResultFailedFixture from './fixtures/scan_result_failed.json';

// Proposed by the platform, pending sineva-ai (see fixtures/README.md). These
// tests pin what the platform sends and accepts so that sineva-ai's real
// contract either matches or changes this one file set and the adapter schema.

const AI_URL = 'http://sineva-ai.test:8000';
const AI_KEY = 'test_internal_key';
const CONTEXT = 'test.signed.jws.context.token';

const call = {
  source_url: scanRequestFixture.source_url,
  locale: scanRequestFixture.locale as 'id',
  scan_id: scanRequestFixture.scan_id,
  contextToken: CONTEXT,
  requestId: 'req-123',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function stubFetch(factory: () => Response | Promise<Response>) {
  const mock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => factory());
  vi.stubGlobal('fetch', mock);
  return mock;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('website scan gateway contract (WP-M1-36, FR-ONB-09 to FR-ONB-12)', () => {
  const gateway = new InternalWebsiteScanGateway();

  beforeEach(() => {
    vi.stubEnv('AI_ENGINE_INTERNAL_URL', AI_URL);
    vi.stubEnv('AI_ENGINE_INTERNAL_API_KEY', AI_KEY);
    vi.stubEnv('AI_ENGINE_TIMEOUT_MS', '15000');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('the request', () => {
    it('posts exactly the fixture body to /internal/v1/profile/scan with internal key, signed context, request id and traceparent', async () => {
      const fetchMock = stubFetch(() => jsonResponse(scanResultFixture));
      await gateway.scan(call);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${AI_URL}/internal/v1/profile/scan`);
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual(scanRequestFixture);
      const headers = init?.headers as Record<string, string>;
      expect(headers['X-Internal-Api-Key']).toBe(AI_KEY);
      expect(headers['X-Sineva-Context']).toBe(CONTEXT);
      expect(headers['X-Request-Id']).toBe('req-123');
      expect(headers['traceparent']).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('never puts identity (user id, workspace id) in the body: it travels in the signed context only', async () => {
      const fetchMock = stubFetch(() => jsonResponse(scanResultFixture));
      await gateway.scan(call);
      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(Object.keys(body).sort()).toEqual(['locale', 'scan_id', 'source_url']);
    });
  });

  describe('the answer', () => {
    it('parses scan_result.json with evidence on every extracted value', async () => {
      stubFetch(() => jsonResponse(scanResultFixture));
      const result = await gateway.scan(call);
      expect(result.status).toBe('succeeded');
      expect(result.scan_id).toBe(scanRequestFixture.scan_id);
      expect(result.fields.display_name).toEqual({
        value: 'Toko Kopi Nusantara',
        source_url: 'https://www.tokokopinusantara.example/',
        evidence_snippet: 'Selamat datang di Toko Kopi Nusantara',
      });
      expect(result.fields.contact_channels?.value).toHaveLength(2);
      expect(result.offers.map((o) => o.name)).toEqual(['Kopi Gayo 250g', 'Dripper V60']);
      expect(result.policies[0].kind).toBe('shipping');
      expect(result.site_language).toBe('id');
    });

    it('parses scan_result_partial.json: a field without evidence is simply absent, never invented', async () => {
      stubFetch(() => jsonResponse(scanResultPartialFixture));
      const result = await gateway.scan(call);
      expect(result.status).toBe('partial');
      expect(Object.keys(result.fields)).toEqual(['display_name']);
      expect(result.fields.description).toBeUndefined();
      expect(result.offers).toEqual([]);
    });

    it('parses scan_result_failed.json as a normal answer with a typed error code, not an exception', async () => {
      stubFetch(() => jsonResponse(scanResultFailedFixture));
      const result = await gateway.scan(call);
      expect(result.status).toBe('failed');
      expect(result.error_code).toBe('login_required');
      expect(result.fields).toEqual({});
    });

    it('strips a price smuggled into an offer: prices exist only when the owner types them', async () => {
      const body = clone(scanResultFixture) as { data: { offers: Array<Record<string, unknown>> } };
      body.data.offers[0].price_amount = 85000;
      body.data.offers[0].price = 'Rp 85.000';
      stubFetch(() => jsonResponse(body));
      const result = await gateway.scan(call);
      expect(result.offers[0]).not.toHaveProperty('price_amount');
      expect(result.offers[0]).not.toHaveProperty('price');
    });

    it('accepts additive fields it does not read', async () => {
      const body = clone(scanResultFixture) as { data: Record<string, unknown> };
      body.data.new_future_field = { anything: true };
      stubFetch(() => jsonResponse(body));
      await expect(gateway.scan(call)).resolves.toMatchObject({ status: 'succeeded' });
    });
  });

  describe('failure modes (ADR-0016)', () => {
    it('network failure is UpstreamUnavailableError (503)', async () => {
      stubFetch(() => {
        throw new TypeError('fetch failed');
      });
      const error = await gateway.scan(call).catch((e) => e);
      expect(error).toBeInstanceOf(UpstreamUnavailableError);
      expect(error.status).toBe(503);
    });

    it('a timeout aborts the request and is UpstreamUnavailableError', async () => {
      vi.useFakeTimers();
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
        ),
      );
      const pending = gateway.scan(call).catch((e) => e);
      await vi.advanceTimersByTimeAsync(26_000);
      expect(await pending).toBeInstanceOf(UpstreamUnavailableError);
    });

    it('sineva-ai answering 503 is UpstreamUnavailableError', async () => {
      stubFetch(() => jsonResponse({ success: false, errors: [{ code: 'dependency_unavailable', detail: 'x' }] }, 503));
      await expect(gateway.scan(call)).rejects.toBeInstanceOf(UpstreamUnavailableError);
    });

    it('a 500 is UpstreamServiceError (502) and never echoes the upstream text', async () => {
      stubFetch(() => jsonResponse({ success: false, message: 'Traceback: secret internals' }, 500));
      const error = await gateway.scan(call).catch((e) => e);
      expect(error).toBeInstanceOf(UpstreamServiceError);
      expect(error.status).toBe(502);
      expect(error.message).not.toContain('secret internals');
    });

    it('a rejected signed context is ContextInvalidError', async () => {
      stubFetch(() => jsonResponse({ success: false, errors: [{ code: 'context_invalid', detail: 'bad signature' }] }, 401));
      await expect(gateway.scan(call)).rejects.toBeInstanceOf(ContextInvalidError);
    });

    it('a non-JSON body is UpstreamServiceError', async () => {
      stubFetch(() => new Response('<html>gateway</html>', { status: 200 }));
      await expect(gateway.scan(call)).rejects.toBeInstanceOf(UpstreamServiceError);
    });

    it('a value without evidence breaks the contract: UpstreamServiceError, never a partial parse', async () => {
      const body = clone(scanResultFixture) as { data: { fields: { display_name: Record<string, unknown> } } };
      delete body.data.fields.display_name.evidence_snippet;
      stubFetch(() => jsonResponse(body));
      await expect(gateway.scan(call)).rejects.toBeInstanceOf(UpstreamServiceError);
    });

    it('an evidence link that is not http(s) breaks the contract (it becomes a "From your website" link)', async () => {
      const body = clone(scanResultFixture) as { data: { fields: { display_name: Record<string, unknown> } } };
      body.data.fields.display_name.source_url = 'javascript:alert(1)';
      stubFetch(() => jsonResponse(body));
      await expect(gateway.scan(call)).rejects.toBeInstanceOf(UpstreamServiceError);
    });

    it('an unknown error_code or status breaks the contract', async () => {
      const unknownCode = clone(scanResultFailedFixture) as { data: Record<string, unknown> };
      unknownCode.data.error_code = 'something_new';
      stubFetch(() => jsonResponse(unknownCode));
      await expect(gateway.scan(call)).rejects.toBeInstanceOf(UpstreamServiceError);

      const unknownStatus = clone(scanResultFixture) as { data: Record<string, unknown> };
      unknownStatus.data.status = 'queued';
      stubFetch(() => jsonResponse(unknownStatus));
      await expect(gateway.scan(call)).rejects.toBeInstanceOf(UpstreamServiceError);
    });

    it('oversized extracted text is refused rather than stored', async () => {
      const body = clone(scanResultFixture) as { data: { policies: Array<Record<string, unknown>> } };
      body.data.policies[0].body = 'x'.repeat(5000);
      stubFetch(() => jsonResponse(body));
      await expect(gateway.scan(call)).rejects.toBeInstanceOf(UpstreamServiceError);
    });
  });
});
