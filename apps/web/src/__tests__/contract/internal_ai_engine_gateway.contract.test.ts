import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UpstreamServiceError,
  UpstreamUnavailableError,
} from '@/server/domain/errors/domain_error';
import type { AiEngineChatRequest } from '@/server/domain/repositories/ai_engine_gateway';
import { InternalAiEngineGateway } from '@/server/infrastructure/gateways/internal_ai_engine_gateway';
import chatRequestFixture from './fixtures/chat_request.json';
import chatResponseEnvelopeFixture from './fixtures/chat_response_envelope.json';

// sineva-ai owns the chat contract. These tests pin what the platform gateway
// sends and accepts against fixtures copied from sineva-ai (see
// fixtures/README.md), so a drift on either side fails here instead of
// surfacing as a runtime 401/422 behind a silent fallback.

const AI_URL = 'http://sineva-ai.test:8000';
const AI_KEY = 'test_internal_key';

const SLUG = 'sinofinance';

function platformRequest(): AiEngineChatRequest {
  return {
    agent_slug: SLUG,
    session_id: chatRequestFixture.session_id,
    user_id: chatRequestFixture.user_id,
    message_text: chatRequestFixture.user_message,
    context_metadata: chatRequestFixture.context_metadata,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(factory: () => Response | Promise<Response>) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => factory(),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof stubFetch>) {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  const [url, init] = call;
  return { url, init: init as RequestInit };
}

describe('InternalAiEngineGateway contract with sineva-ai', () => {
  beforeEach(() => {
    vi.stubEnv('AI_ENGINE_INTERNAL_URL', AI_URL);
    vi.stubEnv('AI_ENGINE_INTERNAL_API_KEY', AI_KEY);
    vi.stubEnv('AI_ENGINE_TIMEOUT_MS', '15000');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('dispatchAgentChat request', () => {
    it('authenticates with X-Internal-Api-Key and never the legacy token header', async () => {
      const fetchMock = stubFetch(() =>
        jsonResponse(chatResponseEnvelopeFixture),
      );

      await new InternalAiEngineGateway().dispatchAgentChat(platformRequest());

      const headers = new Headers(lastCall(fetchMock).init.headers);
      expect(headers.get('X-Internal-Api-Key')).toBe(AI_KEY);
      expect(headers.has('X-Internal-Service-Token')).toBe(false);
      expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('sends exactly the keys ChatRequestDTO accepts, with user_message', async () => {
      const fetchMock = stubFetch(() =>
        jsonResponse(chatResponseEnvelopeFixture),
      );

      await new InternalAiEngineGateway().dispatchAgentChat(platformRequest());

      const body: Record<string, unknown> = JSON.parse(
        String(lastCall(fetchMock).init.body),
      );
      // tenant_id is deliberately omitted: the public chat request has no
      // workspace yet, so the fixture is compared without it.
      const expected = Object.fromEntries(
        Object.entries(chatRequestFixture).filter(
          ([key]) => key !== 'tenant_id',
        ),
      );
      expect(body).toEqual(expected);
      expect(body).not.toHaveProperty('agent_slug');
      expect(body).not.toHaveProperty('message_text');
      expect(body).not.toHaveProperty('tenant_id');
    });

    it('omits optional fields that were not provided instead of sending null', async () => {
      const fetchMock = stubFetch(() =>
        jsonResponse(chatResponseEnvelopeFixture),
      );

      await new InternalAiEngineGateway().dispatchAgentChat({
        agent_slug: SLUG,
        user_id: 'usr_01J9ZQ4K7M',
        message_text: 'Hello',
      });

      const body: Record<string, unknown> = JSON.parse(
        String(lastCall(fetchMock).init.body),
      );
      expect(Object.keys(body).sort()).toEqual(['user_id', 'user_message']);
    });

    it('POSTs to the slug in the path, URL-encoded', async () => {
      const fetchMock = stubFetch(() =>
        jsonResponse(chatResponseEnvelopeFixture),
      );
      const gateway = new InternalAiEngineGateway();

      await gateway.dispatchAgentChat(platformRequest());
      expect(lastCall(fetchMock).url).toBe(
        `${AI_URL}/api/v1/agents/sinofinance/chat`,
      );
      expect(lastCall(fetchMock).init.method).toBe('POST');

      await gateway.dispatchAgentChat({
        ...platformRequest(),
        agent_slug: 'a/b c?x=1',
      });
      expect(lastCall(fetchMock).url).toBe(
        `${AI_URL}/api/v1/agents/a%2Fb%20c%3Fx%3D1/chat`,
      );
    });

    it('does not cap the configured timeout at 2.5s', async () => {
      vi.useFakeTimers();
      let signal: AbortSignal | undefined;
      const fetchMock = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            signal = init?.signal ?? undefined;
            signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const pending = new InternalAiEngineGateway().dispatchAgentChat(
        platformRequest(),
      );
      const settled = pending.then(
        () => 'resolved',
        (error: unknown) => error,
      );

      await vi.advanceTimersByTimeAsync(14_000);
      expect(signal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(1_500);
      expect(signal?.aborted).toBe(true);
      expect(await settled).toBeInstanceOf(UpstreamUnavailableError);
    });
  });

  describe('dispatchAgentChat response', () => {
    it('maps a full sineva-ai success envelope into the domain response', async () => {
      stubFetch(() => jsonResponse(chatResponseEnvelopeFixture));

      const reply = await new InternalAiEngineGateway().dispatchAgentChat(
        platformRequest(),
      );

      expect(reply).toEqual({
        ...chatResponseEnvelopeFixture.data,
        latency_ms: expect.any(Number),
      });
      expect(reply.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it.each([
      ['a non-2xx status', () => jsonResponse({ success: false }, 401)],
      [
        'a 5xx status',
        () =>
          new Response('<html>upstream exploded</html>', {
            status: 500,
            headers: { 'Content-Type': 'text/html' },
          }),
      ],
    ])('throws UpstreamServiceError on %s', async (_label, factory) => {
      stubFetch(factory);

      await expect(
        new InternalAiEngineGateway().dispatchAgentChat(platformRequest()),
      ).rejects.toBeInstanceOf(UpstreamServiceError);
    });

    it('logs the upstream status without leaking the internal key', async () => {
      stubFetch(() => jsonResponse({ success: false, message: 'nope' }, 401));
      const errorSpy = vi.spyOn(console, 'error');

      await expect(
        new InternalAiEngineGateway().dispatchAgentChat(platformRequest()),
      ).rejects.toBeInstanceOf(UpstreamServiceError);

      const logged = JSON.stringify(errorSpy.mock.calls);
      expect(logged).toContain('401');
      expect(logged).not.toContain(AI_KEY);
    });

    const envelopeWith = (mutate: (data: Record<string, unknown>) => void) => {
      const copy = structuredClone(chatResponseEnvelopeFixture) as {
        data: Record<string, unknown>;
      };
      mutate(copy.data);
      return copy;
    };

    it.each([
      ['non-JSON body', () => new Response('not json', { status: 200 })],
      [
        'success=false envelope',
        () =>
          jsonResponse({
            ...chatResponseEnvelopeFixture,
            success: false,
          }),
      ],
      ['null data', () => jsonResponse({ success: true, data: null })],
      [
        'missing reply_content',
        () => jsonResponse(envelopeWith((d) => delete d.reply_content)),
      ],
      [
        'the legacy reply_text shape',
        () =>
          jsonResponse({
            success: true,
            status_code: 200,
            message: 'ok',
            data: { reply_text: 'hi', reply_id: 'rpl_1' },
          }),
      ],
      [
        'a non-UUID message_id',
        () =>
          jsonResponse(envelopeWith((d) => (d.message_id = 'rpl_not_a_uuid'))),
      ],
      [
        'a non-numeric token_usage value',
        () =>
          jsonResponse(
            envelopeWith((d) => (d.token_usage = { total_tokens: 'many' })),
          ),
      ],
    ])('throws UpstreamServiceError on %s', async (_label, factory) => {
      stubFetch(factory);

      await expect(
        new InternalAiEngineGateway().dispatchAgentChat(platformRequest()),
      ).rejects.toBeInstanceOf(UpstreamServiceError);
    });

    it('tolerates additive fields sineva-ai may add later', async () => {
      stubFetch(() =>
        jsonResponse(envelopeWith((d) => (d.future_field = { a: 1 }))),
      );

      const reply = await new InternalAiEngineGateway().dispatchAgentChat(
        platformRequest(),
      );

      expect(reply.reply_content).toBe(
        chatResponseEnvelopeFixture.data.reply_content,
      );
      expect(reply).not.toHaveProperty('future_field');
    });

    it.each([
      ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
      [
        'an aborted request',
        () => Promise.reject(new DOMException('aborted', 'AbortError')),
      ],
    ])('throws UpstreamUnavailableError on %s', async (_label, factory) => {
      stubFetch(factory);

      await expect(
        new InternalAiEngineGateway().dispatchAgentChat(platformRequest()),
      ).rejects.toBeInstanceOf(UpstreamUnavailableError);
    });
  });

  describe('checkHealth', () => {
    it('sends X-Internal-Api-Key to /api/v1/health', async () => {
      const fetchMock = stubFetch(() => jsonResponse({ success: true }));

      const health = await new InternalAiEngineGateway().checkHealth();

      const { url, init } = lastCall(fetchMock);
      expect(url).toBe(`${AI_URL}/api/v1/health`);
      expect(init.method).toBe('GET');
      const headers = new Headers(init.headers);
      expect(headers.get('X-Internal-Api-Key')).toBe(AI_KEY);
      expect(headers.has('X-Internal-Service-Token')).toBe(false);
      expect(health.is_reachable).toBe(true);
    });

    it('reports unreachable instead of throwing when sineva-ai is down', async () => {
      stubFetch(() => Promise.reject(new TypeError('fetch failed')));

      const health = await new InternalAiEngineGateway().checkHealth();

      expect(health.is_reachable).toBe(false);
    });
  });
});
