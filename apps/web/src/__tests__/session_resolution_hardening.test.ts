import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendSuccessJson } from '@/server/http/response_helper';
import { setCustomSessionResolver, withAuth } from '@/server/http/with_auth';

// The guard resolves a bearer token through the container's JWT service. The
// service is faked here so the production token branch of resolveSession runs.
const jwt = vi.hoisted(() => ({
  resolveSessionFromToken: vi.fn(),
}));

vi.mock('@/server/container', () => ({
  getPrismaClient: () => ({ session: { findFirst: vi.fn().mockResolvedValue(null) } }),
  getJwtAuthService: () => ({ resolveSessionFromToken: jwt.resolveSessionFromToken }),
}));

const whoami = withAuth(
  async (_request, { requestContext }) =>
    sendSuccessJson({ data: { user_id: requestContext.user_id, staff_role: requestContext.staff_role } }),
  { scope: 'user' },
);

const staffOnly = withAuth(async () => sendSuccessJson({ data: { ok: true } }), {
  scope: 'user',
  requiredStaffRole: 'platform_admin',
});

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/me', { method: 'GET', headers });
}

describe('Session resolution has no test backdoor (FR-SEC-02, FR-AUTH-23)', () => {
  beforeEach(() => {
    setCustomSessionResolver(null);
    jwt.resolveSessionFromToken.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('answers 401 when a request carries no credentials, even with NODE_ENV=test', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    const res = await whoami(request());
    expect(res.status).toBe(401);
  });

  it('ignores x-test-session-* headers: a header alone never authenticates', async () => {
    const res = await whoami(
      request({
        'x-test-session-user-id': 'usr_attacker',
        'x-test-session-role': 'owner',
        'x-test-session-workspaces': '*',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('ignores x-test-staff-role: staff access needs a real session', async () => {
    const res = await staffOnly(request({ 'x-test-staff-role': 'platform_admin' }));
    expect(res.status).toBe(401);
  });

  it('authenticates a bearer token through the JWT service', async () => {
    jwt.resolveSessionFromToken.mockResolvedValue({
      userId: 'usr_real',
      sessionId: 'sess_real',
      memberships: [],
      freshUntil: null,
      staffRole: null,
      emailVerified: true,
    });
    const res = await whoami(request({ authorization: 'Bearer aaa.bbb.ccc' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.user_id).toBe('usr_real');
    expect(jwt.resolveSessionFromToken).toHaveBeenCalledWith('aaa.bbb.ccc');
  });

  it('does not let a header grant staff to a real non-staff session', async () => {
    jwt.resolveSessionFromToken.mockResolvedValue({
      userId: 'usr_real',
      sessionId: 'sess_real',
      memberships: [],
      staffRole: null,
    });
    const res = await staffOnly(
      request({ authorization: 'Bearer aaa.bbb.ccc', 'x-test-staff-role': 'platform_admin' }),
    );
    expect(res.status).toBe(403);
  });

  it('refuses to install a session resolver override in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => setCustomSessionResolver(async () => null)).toThrow(/production/i);
  });
});
