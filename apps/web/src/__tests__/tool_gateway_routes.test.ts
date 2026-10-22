import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/internal/v1/tool-gateway/execute/route';
import { POST as apiPOST } from '@/app/api/internal/v1/tool-gateway/execute/route';
import { GET } from '@/app/internal/v1/connections/resolve/route';
import { ToolGatewayError } from '@/server/domain/toolgateway/tool_executor';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), resolve: vi.fn() }));
vi.mock('@/server/container', () => ({
  getExecuteToolUseCase: () => ({ execute: mocks.execute }),
  getResolveToolConnectionsUseCase: () => ({ execute: mocks.resolve }),
}));
vi.mock('@/server/infrastructure/config/env', () => ({
  getEnvConfig: () => ({
    ai_engine_internal_api_key: 'internal-test-key',
    cron_secret: 'cron-test-secret',
  }),
}));
const input = {
  tool_name: 'gmail_get_message',
  arguments: { message_id: 'm1' },
  run_id: 'run_33333333-3333-4333-8333-333333333333',
  call_id: 'call1',
};
function req(body: unknown = input, extra: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/internal/v1/tool-gateway/execute', {
    method: 'POST',
    headers: {
      'x-internal-api-key': 'internal-test-key',
      'x-sineva-context': 'signed.context',
      'content-type': 'application/json',
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue({ status: 'ok', result: { id: 'm1' }, error_code: null });
  mocks.resolve.mockResolvedValue({ connections: [] });
});
describe('Tool Gateway internal routes', () => {
  it.each([POST, apiPOST])('forwards the validated request and signed context', async (handler) => {
    const response = await handler(req());
    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith({ ...input, mode: 'live' }, 'signed.context');
  });
  it('refuses a cron bearer and no internal key', async () => {
    const request = req(input, {
      'x-internal-api-key': '',
      authorization: 'Bearer cron-test-secret',
    });
    expect((await POST(request)).status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([
    { ...input, user_id: 'forged' },
    { ...input, approval_id: 'forged' },
    { ...input, mode: 'bypass' },
    { ...input, arguments: { large: 'x'.repeat(65537) } },
  ])('rejects invalid or identity-widening input', async (body) => {
    expect((await POST(req(body))).status).toBe(422);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404, 409, 429, 502, 503])('keeps a typed %s error', async (status) => {
    mocks.execute.mockRejectedValue(
      new ToolGatewayError(status === 429 ? 'rate_limited' : 'action_not_allowed', status),
    );
    const response = await POST(req());
    expect(response.status).toBe(status);
    if (status === 429) expect(response.headers.get('Retry-After')).toBe('60');
  });
  it('resolves metadata using signed identity and query scope', async () => {
    const request = new NextRequest(
      `http://localhost/api/internal/v1/connections/resolve?provider_id=gmail&run_id=${input.run_id}`,
      {
        headers: {
          'x-internal-api-key': 'internal-test-key',
          'x-sineva-context': 'signed.context',
        },
      },
    );
    expect((await GET(request)).status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith(
      { provider_id: 'gmail', run_id: input.run_id },
      'signed.context',
    );
  });
});
