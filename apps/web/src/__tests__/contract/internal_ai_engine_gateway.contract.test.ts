import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContextInvalidError,
  DependencyUnavailableError,
  ModelUnavailableError,
  UpstreamServiceError,
  UpstreamUnavailableError,
} from '@/server/domain/errors/domain_error';
import type { AiEngineChatRequest } from '@/server/domain/repositories/ai_engine_gateway';
import { InternalAiEngineGateway } from '@/server/infrastructure/gateways/internal_ai_engine_gateway';
import {
  chatTurnRequestV2Schema,
  chatTurnResultV2Schema,
  parseSseTranscript,
  sseEventSchemas,
  type ChatTurnRequestV2,
} from '@/server/application/dtos/chat_v2_dto';
import chatRequestFixture from './fixtures/chat_request.json';
import chatResponseEnvelopeFixture from './fixtures/chat_response_envelope.json';
import chatTurnRequestV2Fixture from './fixtures/chat_turn_request_v2.json';
import chatTurnResultV2Fixture from './fixtures/chat_turn_result_v2.json';
import chatTurnResultNeedsApprovalFixture from './fixtures/chat_turn_result_v2_needs_approval.json';
import chatTurnResultNeedsInputFixture from './fixtures/chat_turn_result_v2_needs_input.json';
import chatTurnResultBudgetExceededFixture from './fixtures/chat_turn_result_v2_budget_exceeded.json';
import chatTurnResultFailedFixture from './fixtures/chat_turn_result_v2_failed.json';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

const AI_URL = 'http://sineva-ai.test:8000';
const AI_KEY = 'test_internal_key';
const TEST_CONTEXT_TOKEN = 'test.signed.jws.context.token';
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

describe('Contract v2 Fixtures Validation (WP-M0-28, R-40, FR-AIR-07, FR-AIR-08, FR-AIR-10)', () => {
  it('parses chat_turn_request_v2.json fixture with chatTurnRequestV2Schema', () => {
    const parsed = chatTurnRequestV2Schema.safeParse(chatTurnRequestV2Fixture);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.client_message_id).toBe('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d');
      expect(parsed.data.mentions).toHaveLength(1);
      expect(parsed.data.attachments).toHaveLength(1);
      expect(parsed.data.use_library).toBe(true);
    }
  });

  it('rejects forbidden extra keys on chatTurnRequestV2Schema', () => {
    const withExtra = {
      ...chatTurnRequestV2Fixture,
      user_id: 'usr_hack_impersonation',
    };
    const parsed = chatTurnRequestV2Schema.safeParse(withExtra);
    expect(parsed.success).toBe(false);
  });

  it('parses chat_turn_result_v2.json fixture (completed)', () => {
    const parsed = chatTurnResultV2Schema.safeParse(chatTurnResultV2Fixture);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('completed');
      expect(parsed.data.usage.total_tokens).toBe(1570);
      expect(parsed.data.tool_calls).toHaveLength(1);
      expect(parsed.data.citations).toHaveLength(1);
    }
  });

  it('parses all terminal status fixtures (needs_approval, needs_input, budget_exceeded, failed)', () => {
    expect(chatTurnResultV2Schema.safeParse(chatTurnResultNeedsApprovalFixture).success).toBe(true);
    expect(chatTurnResultV2Schema.safeParse(chatTurnResultNeedsInputFixture).success).toBe(true);
    expect(chatTurnResultV2Schema.safeParse(chatTurnResultBudgetExceededFixture).success).toBe(true);
    expect(chatTurnResultV2Schema.safeParse(chatTurnResultFailedFixture).success).toBe(true);
  });

  it('parses sse_transcript_text_only.txt against event vocabulary', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DIR, 'sse_transcript_text_only.txt'), 'utf-8');
    const messages = parseSseTranscript(content);

    expect(messages.length).toBe(4);
    expect(messages[0].event).toBe('token');
    expect(sseEventSchemas.token.safeParse(messages[0].data).success).toBe(true);
    expect(messages[3].event).toBe('done');
    expect(sseEventSchemas.done.safeParse(messages[3].data).success).toBe(true);
  });

  it('parses sse_transcript_error.txt against error event schema', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DIR, 'sse_transcript_error.txt'), 'utf-8');
    const messages = parseSseTranscript(content);

    expect(messages.length).toBe(1);
    expect(messages[0].event).toBe('error');
    const parsed = sseEventSchemas.error.safeParse(messages[0].data);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.code).toBe('model_unavailable');
    }
  });

  it('parses sse_transcript_with_card.txt against card event schemas', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DIR, 'sse_transcript_with_card.txt'), 'utf-8');
    const messages = parseSseTranscript(content);

    expect(messages.length).toBe(5);
    expect(messages[0].event).toBe('token');
    expect(messages[1].event).toBe('card_started');
    expect(sseEventSchemas.card_started.safeParse(messages[1].data).success).toBe(true);

    expect(messages[2].event).toBe('card_patch');
    expect(sseEventSchemas.card_patch.safeParse(messages[2].data).success).toBe(true);

    expect(messages[3].event).toBe('card_completed');
    expect(sseEventSchemas.card_completed.safeParse(messages[3].data).success).toBe(true);

    expect(messages[4].event).toBe('done');
    expect(sseEventSchemas.done.safeParse(messages[4].data).success).toBe(true);
  });
});

describe('InternalAiEngineGateway Contract v2 (WP-M0-28)', () => {
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

  describe('chatTurn', () => {
    const validV2Request: ChatTurnRequestV2 = {
      user_message: 'Calculate SaaS burn metrics',
      session_id: '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3',
      client_message_id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      mentions: [],
      attachments: [],
      use_library: false,
      allow_degraded: false,
    };

    it('sends all 4 security and tracing headers (X-Internal-Api-Key, X-Sineva-Context, traceparent, X-Request-Id)', async () => {
      const fetchMock = stubFetch(() =>
        jsonResponse({
          success: true,
          data: chatTurnResultV2Fixture,
        }),
      );

      const gateway = new InternalAiEngineGateway();
      await gateway.chatTurn({
        agentSlug: 'sinofinance',
        request: validV2Request,
        contextToken: TEST_CONTEXT_TOKEN,
        requestId: 'req_custom_trace_999',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      });

      const { url, init } = lastCall(fetchMock);
      expect(url).toBe(`${AI_URL}/api/v2/agents/sinofinance/chat`);
      expect(init.method).toBe('POST');

      const headers = new Headers(init.headers);
      expect(headers.get('X-Internal-Api-Key')).toBe(AI_KEY);
      expect(headers.get('X-Sineva-Context')).toBe(TEST_CONTEXT_TOKEN);
      expect(headers.get('X-Request-Id')).toBe('req_custom_trace_999');
      expect(headers.get('traceparent')).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
      expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('maps successful chat turn result and measures latency_ms', async () => {
      stubFetch(() =>
        jsonResponse({
          success: true,
          data: chatTurnResultV2Fixture,
        }),
      );

      const gateway = new InternalAiEngineGateway();
      const result = await gateway.chatTurn({
        agentSlug: 'sinofinance',
        request: validV2Request,
        contextToken: TEST_CONTEXT_TOKEN,
      });

      expect(result.run_id).toBe(chatTurnResultV2Fixture.run_id);
      expect(result.status).toBe('completed');
      expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('maps upstream 503 model_unavailable to ModelUnavailableError (503)', async () => {
      stubFetch(() =>
        jsonResponse(
          {
            success: false,
            code: 'model_unavailable',
            message: 'Model is currently overloaded',
          },
          503,
        ),
      );

      const gateway = new InternalAiEngineGateway();
      await expect(
        gateway.chatTurn({
          agentSlug: 'sinofinance',
          request: validV2Request,
          contextToken: TEST_CONTEXT_TOKEN,
        }),
      ).rejects.toBeInstanceOf(ModelUnavailableError);
    });

    it('maps upstream 503 dependency_unavailable to DependencyUnavailableError (503)', async () => {
      stubFetch(() =>
        jsonResponse(
          {
            success: false,
            code: 'dependency_unavailable',
            message: 'Redis or Vector store unavailable',
          },
          503,
        ),
      );

      const gateway = new InternalAiEngineGateway();
      await expect(
        gateway.chatTurn({
          agentSlug: 'sinofinance',
          request: validV2Request,
          contextToken: TEST_CONTEXT_TOKEN,
        }),
      ).rejects.toBeInstanceOf(DependencyUnavailableError);
    });

    it('maps upstream 401/403 context_invalid to ContextInvalidError (500)', async () => {
      stubFetch(() =>
        jsonResponse(
          {
            success: false,
            code: 'context_invalid',
            message: 'Signed context token expired or invalid signature',
          },
          401,
        ),
      );

      const gateway = new InternalAiEngineGateway();
      await expect(
        gateway.chatTurn({
          agentSlug: 'sinofinance',
          request: validV2Request,
          contextToken: TEST_CONTEXT_TOKEN,
        }),
      ).rejects.toBeInstanceOf(ContextInvalidError);
    });

    it('maps upstream non-2xx to UpstreamServiceError (502)', async () => {
      stubFetch(() => jsonResponse({ success: false, message: 'Server crash' }, 500));

      const gateway = new InternalAiEngineGateway();
      await expect(
        gateway.chatTurn({
          agentSlug: 'sinofinance',
          request: validV2Request,
          contextToken: TEST_CONTEXT_TOKEN,
        }),
      ).rejects.toBeInstanceOf(UpstreamServiceError);
    });

    it('maps timeout or network disconnect to UpstreamUnavailableError (503)', async () => {
      stubFetch(() => Promise.reject(new TypeError('network failure')));

      const gateway = new InternalAiEngineGateway();
      await expect(
        gateway.chatTurn({
          agentSlug: 'sinofinance',
          request: validV2Request,
          contextToken: TEST_CONTEXT_TOKEN,
        }),
      ).rejects.toBeInstanceOf(UpstreamUnavailableError);
    });
  });

  describe('chatStream', () => {
    it('sends headers and returns response body stream', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: token\ndata: {"token":"hi"}\n\n'));
          controller.close();
        },
      });

      const fetchMock = stubFetch(() =>
        new Response(mockStream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const gateway = new InternalAiEngineGateway();
      const stream = await gateway.chatStream({
        agentSlug: 'sinofinance',
        request: {
          user_message: 'Hi',
          client_message_id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        },
        contextToken: TEST_CONTEXT_TOKEN,
      });

      expect(stream).toBeDefined();
      const { url } = lastCall(fetchMock);
      expect(url).toBe(`${AI_URL}/api/v2/agents/sinofinance/chat/stream`);
    });
  });

  describe('listAgents, getRunEvents, cancelRun', () => {
    it('listAgents sends GET /api/v2/agents with internal headers', async () => {
      const fetchMock = stubFetch(() =>
        jsonResponse([
          { agent_slug: 'sinofinance', display_name: 'Sino Finance', status: 'online' },
        ]),
      );

      const gateway = new InternalAiEngineGateway();
      const agents = await gateway.listAgents({ contextToken: TEST_CONTEXT_TOKEN });

      expect(agents).toHaveLength(1);
      expect(lastCall(fetchMock).url).toBe(`${AI_URL}/api/v2/agents`);
    });

    it('getRunEvents sends GET /api/v2/runs/{run_id}/events?after={seq}', async () => {
      const fetchMock = stubFetch(() =>
        new Response('id: 1\nevent: token\ndata: {"token":"ok"}\n\n', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const gateway = new InternalAiEngineGateway();
      const result = await gateway.getRunEvents({
        runId: '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e',
        afterSeq: 0,
        contextToken: TEST_CONTEXT_TOKEN,
      });

      expect(result.run_id).toBe('7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e');
      expect(result.events).toHaveLength(1);
      expect(lastCall(fetchMock).url).toContain('/api/v2/runs/7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e/events?after=0');
    });

    it('cancelRun sends POST /api/v2/runs/{run_id}/cancel', async () => {
      const fetchMock = stubFetch(() =>
        jsonResponse({
          run_id: '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e',
          status: 'cancelled',
          cancelled_at: '2026-10-21T15:00:00.000Z',
        }),
      );

      const gateway = new InternalAiEngineGateway();
      const result = await gateway.cancelRun({
        runId: '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e',
        contextToken: TEST_CONTEXT_TOKEN,
      });

      expect(result.status).toBe('cancelled');
      expect(lastCall(fetchMock).url).toBe(
        `${AI_URL}/api/v2/runs/7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e/cancel`,
      );
      expect(lastCall(fetchMock).init.method).toBe('POST');
    });
  });

  describe('Legacy contract compatibility & health', () => {
    // SEC-6, FR-SEC-20: an upstream error body can echo the user's message.
    // The log keeps status and size only, and masks anything free-text.
    it.each([
      [
        'non-2xx JSON body',
        () =>
          jsonResponse(
            { success: false, detail: 'bad input NIK 3273011508900001 budi@contoh.co.id' },
            422,
          ),
      ],
      [
        'non-2xx text body',
        () =>
          new Response('echo: telp 081234567890 budi@contoh.co.id', { status: 500 }),
      ],
      [
        'non-JSON 200 body',
        () =>
          new Response('NIK 3273011508900001 budi@contoh.co.id', { status: 200 }),
      ],
    ])('does not log the upstream body on %s', async (_label, factory) => {
      stubFetch(factory);
      const errorSpy = vi.spyOn(console, 'error');

      await expect(
        new InternalAiEngineGateway().dispatchAgentChat(platformRequest()),
      ).rejects.toBeInstanceOf(UpstreamServiceError);

      const logged = JSON.stringify(errorSpy.mock.calls);
      expect(logged).not.toContain('3273011508900001');
      expect(logged).not.toContain('budi@contoh.co.id');
      expect(logged).not.toContain('081234567890');
      expect(logged).not.toContain('echo:');
      expect(logged).toMatch(/byte_length\\":\d+/);
    });

    it('does not log the request url or message text when the call fails', async () => {
      stubFetch(() => {
        throw new TypeError('fetch failed');
      });
      const errorSpy = vi.spyOn(console, 'error');

      await expect(
        new InternalAiEngineGateway().dispatchAgentChat(platformRequest()),
      ).rejects.toBeInstanceOf(UpstreamUnavailableError);

      const logged = JSON.stringify(errorSpy.mock.calls);
      expect(logged).toContain('ai_engine.request_failed');
      expect(logged).not.toContain(platformRequest().message_text);
      expect(logged).not.toContain(platformRequest().user_id);
    });

    it('logs only schema paths, never failing values, on a contract violation', async () => {
      stubFetch(() =>
        jsonResponse({
          success: true,
          data: {
            ...chatResponseEnvelopeFixture.data,
            reply_content: 12345,
            display_name: 'Budi 3273011508900001',
            message_id: 'budi@contoh.co.id',
          },
        }),
      );
      const errorSpy = vi.spyOn(console, 'error');

      await expect(
        new InternalAiEngineGateway().dispatchAgentChat(platformRequest()),
      ).rejects.toBeInstanceOf(UpstreamServiceError);

      const logged = JSON.stringify(errorSpy.mock.calls);
      expect(logged).toContain('ai_engine.contract_violation');
      expect(logged).toContain('data.reply_content');
      expect(logged).not.toContain('3273011508900001');
      expect(logged).not.toContain('budi@contoh.co.id');
    });


    it('dispatchAgentChat works with legacy v1 request/response', async () => {
      stubFetch(() => jsonResponse(chatResponseEnvelopeFixture));
      const reply = await new InternalAiEngineGateway().dispatchAgentChat(platformRequest());
      expect(reply.reply_content).toBe(chatResponseEnvelopeFixture.data.reply_content);
    });

    it('checkHealth sends X-Internal-Api-Key to /api/v1/health', async () => {
      const fetchMock = stubFetch(() => jsonResponse({ success: true, data: { version: '2.0.0' } }));
      const health = await new InternalAiEngineGateway().checkHealth();
      expect(health.is_reachable).toBe(true);
      expect(lastCall(fetchMock).url).toBe(`${AI_URL}/api/v1/health`);
    });
  });

  describe('Security & Public Contract Invariant: No user_id or workspace_id in body (Task 6, SEC-2, API-4, X2)', () => {
    it('verifies that no public DTO schema accepts user_id or workspace_id', async () => {
      const dtosPath = path.resolve(__dirname, '../../server/application/dtos');
      const files = fs.readdirSync(dtosPath);

      for (const file of files) {
        if (!file.endsWith('.ts')) continue;
        const content = fs.readFileSync(path.join(dtosPath, file), 'utf-8');

        // Check for public request schemas defining user_id or workspace_id as body properties
        // (excluding internal/tenant isolation utilities if any)
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (
            trimmed.startsWith('user_id: z.') ||
            trimmed.startsWith('workspace_id: z.')
          ) {
            throw new Error(
              `Found forbidden body field in ${file}: "${trimmed}". Public contract must derive identity from RequestContext (SEC-2).`,
            );
          }
        }
      }
    });
  });
});
