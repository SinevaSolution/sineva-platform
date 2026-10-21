import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postAgent } from '@/app/api/v1/agents/route';
import { POST as postStoragePresign } from '@/app/api/v1/storage/presign/route';
import { DomainError } from '@/server/domain/errors/domain_error';
import { extractRequestId, handleRouteError } from '@/server/http/response_helper';
import { InternalAiEngineGateway } from '@/server/infrastructure/gateways/internal_ai_engine_gateway';

// We mock the container so we can test route handling without real external services
vi.mock('@/server/container', () => ({
  getGetAgentsUseCase: () => ({
    registerAgent: vi.fn(),
  }),
  getPresignStorageUploadUseCase: () => ({
    execute: vi.fn(),
  }),
  getSystemHealthUseCase: () => ({
    execute: vi.fn(),
  }),
}));

describe('Honest Errors & Request ID (WP-M0-07)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('malformed or invalid JSON returns 422 with validation_failed code (API-1)', async () => {
    const malformedReq = new NextRequest('http://localhost:3000/api/v1/agents', {
      method: 'POST',
      body: '{"invalid_json": ',
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await postAgent(malformedReq);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.code).toBe('validation_failed');
    expect(body.errors).toBeDefined();
    expect(body.errors[0].code).toBe('validation_failed');
  });

  it('empty body on POST returns 422 with validation_failed code (API-1)', async () => {
    const emptyReq = new NextRequest('http://localhost:3000/api/v1/agents', {
      method: 'POST',
      body: '',
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await postAgent(emptyReq);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.code).toBe('validation_failed');
  });

  it('storage route returns 422 with validation_failed for malformed JSON body (API-1)', async () => {
    const malformedReq = new NextRequest(
      'http://localhost:3000/api/v1/storage/presign',
      {
        method: 'POST',
        body: '{"file_name": ',
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const res = await postStoragePresign(malformedReq);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.code).toBe('validation_failed');
  });

  it('handleRouteError never leaks raw internal exception messages in 500 responses (SEC-5)', async () => {
    const secretError = new Error('CRITICAL_SECRET_DATABASE_PASSWORD_LEAK');
    const res = handleRouteError(secretError);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.code).toBe('internal_error');
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('CRITICAL_SECRET_DATABASE_PASSWORD_LEAK');
    expect(body.meta.request_id).toBeDefined();
    expect(res.headers.get('X-Request-Id')).toBe(body.meta.request_id);
  });

  it('accepts incoming X-Request-Id and echoes it in headers and envelope (API-5)', async () => {
    const customRequestId = 'req_custom_uuid_12345';
    const req = new NextRequest('http://localhost:3000/api/v1/agents', {
      method: 'POST',
      body: 'invalid',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': customRequestId,
      },
    });

    const res = await postAgent(req);
    const body = await res.json();

    expect(res.headers.get('X-Request-Id')).toBe(customRequestId);
    expect(body.meta.request_id).toBe(customRequestId);
  });

  it('gateway logs status and byte length only, concealing body text by default (SEC-6)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock global fetch to return 500 with sensitive body
    const sensitiveBody = 'Sensitive personal or customer prompt text that must not be in logs';
    global.fetch = vi.fn().mockResolvedValue({
      status: 500,
      text: vi.fn().mockResolvedValue(sensitiveBody),
    } as unknown as Response);

    const gateway = new InternalAiEngineGateway();

    await expect(
      gateway.dispatchAgentChat({
        agent_slug: 'sinohelp',
        session_id: '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3',
        user_id: 'usr_12345',
        message_text: 'hello',
        request_id: 'req_test_123',
      }),
    ).rejects.toThrow();

    expect(consoleSpy).toHaveBeenCalled();
    const logCall = consoleSpy.mock.calls.find((call) =>
      typeof call[0] === 'string' &&
      (call[0].includes('non-2xx') || call[0].includes('[ai-engine]')),
    );
    expect(logCall).toBeDefined();
    const loggedObj = logCall?.[1] as Record<string, unknown>;
    expect(loggedObj.status).toBe(500);
    expect(loggedObj.byte_length).toBe(sensitiveBody.length);
    expect(loggedObj.body).toBeUndefined();
  });

  it('gateway forwards X-Request-Id header to sineva-ai (API-5)', async () => {
    let capturedHeaders: Record<string, string> = {};
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return Promise.resolve({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              success: true,
              data: {
                message_id: '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3',
                session_id: '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3',
                agent_slug: 'sinofinance',
                display_name: 'Sino Finance',
                handle: '@SinoFinance',
                routed_agent_slug: 'sinofinance',
                reply_content: 'ok',
                model_id: 'openai:gpt-4o-mini',
                execution_mode: 'agno',
                token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
                tool_calls: [],
                citations: [],
                created_at: new Date().toISOString(),
              },
            }),
          ),
      });
    });

    const gateway = new InternalAiEngineGateway();
    await gateway.dispatchAgentChat({
      agent_slug: 'sinofinance',
      session_id: '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3',
      user_id: 'usr_12345',
      message_text: 'test',
      request_id: 'req_trace_uuid_555',
    });

    expect(capturedHeaders['X-Request-Id']).toBe('req_trace_uuid_555');
  });
  it('replaces a client X-Request-Id that is not a safe token with a generated one (API-5)', async () => {
    const hostile = 'abc\r\n[server-error] forged log line';
    const req = new NextRequest('http://localhost:3000/api/v1/agents', {
      method: 'POST',
      body: 'invalid',
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'x'.repeat(300) },
    });
    const res = await postAgent(req);
    const body = await res.json();
    expect(res.headers.get('X-Request-Id')).not.toContain('xxxx');
    expect(body.meta.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // Header values cannot carry CR/LF in a real fetch, but the helper is also
    // called with plain Request objects, so the charset rule is checked directly.
    const direct = extractRequestId(new Request('http://localhost/x', { headers: { 'x-request-id': hostile.replace(/[\r\n]/g, ' ') } }));
    expect(direct).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('never forwards upstream error text to the client on 502 and 503 (SEC-6)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const leaky = 'internal stack detail: db password hunter2 for user alice';
    const gateway = new InternalAiEngineGateway();
    for (const status of [500, 502, 503]) {
      global.fetch = vi.fn().mockResolvedValue({
        status,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({ success: false, code: 'weird upstream code!', message: leaky }),
        ),
      } as unknown as Response);

      const error = await gateway
        .dispatchAgentChat({
          agent_slug: 'sinohelp',
          session_id: '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3',
          user_id: 'usr_12345',
          message_text: 'hello',
          request_id: 'req_test_123',
        })
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(error).toBeInstanceOf(DomainError);
      const res = handleRouteError(error);
      const text = JSON.stringify(await res.json());
      expect(text).not.toContain('hunter2');
      expect(text).not.toContain('weird upstream code');
    }
  });
});
