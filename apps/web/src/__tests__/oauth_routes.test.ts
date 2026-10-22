import { installHeaderSessionResolver } from './fakes/header_session_resolver';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postStart } from '@/app/api/v1/workspaces/[workspace_id]/connections/oauth/start/route';
import { GET as getCallback } from '@/app/api/v1/connections/oauth/callback/route';
import { setSessionCookie } from '@/server/http/auth_cookie_helper';
import { setCustomSessionResolver, type ResolvedSession } from '@/server/http/with_auth';

const m = vi.hoisted(() => ({ start: vi.fn(), callback: vi.fn() }));

vi.mock('@/server/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/container')>();
  return {
    ...actual,
    getStartOAuthFlowUseCase: () => ({ execute: m.start }),
    getHandleOAuthCallbackUseCase: () => ({ execute: m.callback }),
  };
});

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const START_URL = `https://app.sineva.id/api/v1/workspaces/${WS}/connections/oauth/start`;
const p = { params: Promise.resolve({ workspace_id: WS }) };
type Role = 'owner' | 'admin' | 'member' | 'viewer';

function startReq(over: { role?: Role; ws?: string; unauth?: boolean; body?: unknown; headers?: Record<string, string> } = {}) {
  const body = over.body === undefined ? { provider_id: 'google_calendar', scope_bundle: 'calendar_read', owner_scope: 'workspace' } : over.body;
  return new NextRequest(START_URL, {
    method: 'POST',
    headers: {
      ...(over.unauth ? { 'x-test-unauthenticated': 'true' } : {}),
      'x-test-session-user-id': 'usr-alpha',
      'x-test-session-role': over.role ?? 'owner',
      'x-test-session-workspaces': over.ws ?? WS,
      'content-type': 'application/json',
      ...over.headers,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/workspaces/{workspace_id}/connections/oauth/start (FR-CONN-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installHeaderSessionResolver();
    m.start.mockResolvedValue({
      flow_id: 'f-1',
      authorization_url: 'https://accounts.example/authorize?state=abc',
      expires_at: new Date('2026-10-23T10:10:00.000Z'),
    });
  });

  it('401 without a session', async () => {
    expect((await postStart(startReq({ unauth: true }), p)).status).toBe(401);
    expect(m.start).not.toHaveBeenCalled();
  });

  it('403 for a viewer', async () => {
    expect((await postStart(startReq({ role: 'viewer' }), p)).status).toBe(403);
    expect(m.start).not.toHaveBeenCalled();
  });

  it('404 for a workspace the caller is not in (never 403 for another tenant)', async () => {
    const res = await postStart(startReq({ ws: OTHER_WS }), p);
    expect(res.status).toBe(404);
    expect(m.start).not.toHaveBeenCalled();
  });

  it('422 for a bad body, and a user or workspace key in the body is refused, not ignored', async () => {
    expect((await postStart(startReq({ body: { provider_id: 'x' } }), p)).status).toBe(422);
    expect((await postStart(startReq({ body: { provider_id: 'google_calendar', scope_bundle: 'b', owner_scope: 'workspace', workspace_id: OTHER_WS } }), p)).status).toBe(422);
    expect((await postStart(startReq({ body: { provider_id: 'google_calendar', scope_bundle: 'b', owner_scope: 'workspace', user_id: 'someone' } }), p)).status).toBe(422);
    expect((await postStart(startReq({ body: { provider_id: 'google_calendar', scope_bundle: 'b', owner_scope: 'everyone' } }), p)).status).toBe(422);
    expect(m.start).not.toHaveBeenCalled();
  });

  it('403 for a bearer token minted for another audience (session only)', async () => {
    const claims = Buffer.from(JSON.stringify({ aud: 'mcp' })).toString('base64url');
    const res = await postStart(startReq({ headers: { authorization: `Bearer h.${claims}.s` } }), p);
    expect(res.status).toBe(403);
    expect(m.start).not.toHaveBeenCalled();
  });

  it('200 with the envelope; identity comes from the session and the URL, never the body', async () => {
    const res = await postStart(startReq({ body: { provider_id: 'google_calendar', scope_bundle: 'calendar_read', owner_scope: 'user', return_to: '/w/acme/connections' } }), p);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({
      flow_id: 'f-1',
      authorization_url: 'https://accounts.example/authorize?state=abc',
      expires_at: '2026-10-23T10:10:00.000Z',
    });
    expect(json.meta.request_id).toBeTruthy();
    const input = m.start.mock.calls[0]![0];
    expect(input.context.user_id).toBe('usr-alpha');
    expect(input.context.workspace_id).toBe(WS);
    expect(input).toMatchObject({ provider_id: 'google_calendar', scope_bundle: 'calendar_read', owner_scope: 'user', return_to: '/w/acme/connections' });
    expect(Object.keys(input).sort()).toEqual(['context', 'owner_scope', 'provider_id', 'return_to', 'scope_bundle']);
  });

  it('a member may start a personal flow (the use case decides workspace vs personal)', async () => {
    const res = await postStart(startReq({ role: 'member', body: { provider_id: 'google_calendar', scope_bundle: 'calendar_read', owner_scope: 'user' } }), p);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/connections/oauth/callback (FR-CONN-10, FR-CONN-11)', () => {
  const COOKIE_USER = 'usr-cookie';

  beforeEach(() => {
    vi.clearAllMocks();
    // A resolver that authenticates by the session cookie only, like production:
    // no test header, no CSRF header, no Origin.
    setCustomSessionResolver(async (request): Promise<ResolvedSession | null> => {
      const token = request?.cookies.get('sineva_session')?.value;
      return token ? { userId: COOKIE_USER, sessionId: `sess-${token}`, memberships: [{ workspaceId: WS, role: 'owner', specialistScope: 'all' }] } : null;
    });
    m.callback.mockResolvedValue({ result: 'connected', redirect_to: '/w/acme/connections?connection_result=connected&provider_id=notion&connection_id=c-1' });
  });
  afterEach(() => installHeaderSessionResolver());

  function callbackReq(query: string, cookie: string | null = 'tok-1') {
    return new NextRequest(`https://app.sineva.id/api/v1/connections/oauth/callback?${query}`, {
      method: 'GET',
      headers: {
        ...(cookie ? { cookie: `sineva_session=${cookie}` } : {}),
        // A top-level cross-site navigation from the provider.
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'document',
        referer: 'https://accounts.google.com/',
      },
    });
  }

  it('FR-CONN-11: works from a cross-site GET with only the session cookie (SameSite=Lax) and answers with a redirect, never JSON', async () => {
    const res = await getCallback(callbackReq('code=abc&state=xyz&iss=https%3A%2F%2Faccounts.google.com&authuser=0&scope=email'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://app.sineva.id/w/acme/connections?connection_result=connected&provider_id=notion&connection_id=c-1');
    expect(res.headers.get('cache-control')).toMatch(/no-store/);
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await res.text()).toBe('');
    expect(m.callback).toHaveBeenCalledWith({
      query: { code: 'abc', state: 'xyz', iss: 'https://accounts.google.com', error: undefined },
      session: { user_id: COOKIE_USER, session_id: 'sess-tok-1' },
      request_id: expect.any(String),
    });
  });

  it('the session cookie the app issues is SameSite=Lax, which the cross-site GET needs', () => {
    const response = NextResponse.json({});
    setSessionCookie(response, 'token');
    expect(response.cookies.get('sineva_session')?.sameSite).toBe('lax');
  });

  it('passes the provider error through and keeps unknown provider parameters out of the use case', async () => {
    await getCallback(callbackReq('error=access_denied&state=xyz&error_description=nope&junk=1'));
    expect(m.callback.mock.calls[0]![0].query).toEqual({ code: undefined, state: 'xyz', iss: undefined, error: 'access_denied' });
  });

  it('with no session cookie the use case gets nulls and the answer is still a redirect', async () => {
    m.callback.mockResolvedValueOnce({ result: 'error', redirect_to: '/?connection_result=error' });
    const res = await getCallback(callbackReq('code=abc&state=xyz', null));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://app.sineva.id/?connection_result=error');
    expect(m.callback.mock.calls[0]![0].session).toEqual({ user_id: null, session_id: null });
  });

  it('an unexpected failure is a calm redirect, not a JSON error that could echo the query', async () => {
    m.callback.mockRejectedValueOnce(new Error('boom code=abc state=xyz'));
    const res = await getCallback(callbackReq('code=abc&state=xyz'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://app.sineva.id/?connection_result=error');
    expect(await res.text()).toBe('');
  });

  it('refuses absurdly long parameters instead of passing them on', async () => {
    const res = await getCallback(callbackReq(`code=${'a'.repeat(5000)}&state=xyz`));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('connection_result=error');
    expect(m.callback).not.toHaveBeenCalled();
  });
});
