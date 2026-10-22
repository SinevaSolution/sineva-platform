import { installHeaderSessionResolver } from './fakes/header_session_resolver';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getProviders } from '@/app/api/v1/workspaces/[workspace_id]/connections/providers/route';
import { GET as getList } from '@/app/api/v1/workspaces/[workspace_id]/connections/route';
import { POST as postSecret } from '@/app/api/v1/workspaces/[workspace_id]/connections/secret/route';
import { GET as getOne, DELETE as deleteOne } from '@/app/api/v1/workspaces/[workspace_id]/connections/[connection_id]/route';
import { POST as postReconnect } from '@/app/api/v1/workspaces/[workspace_id]/connections/[connection_id]/reconnect/route';
import { POST as postTest } from '@/app/api/v1/workspaces/[workspace_id]/connections/[connection_id]/test/route';
import { PUT as putGrants } from '@/app/api/v1/workspaces/[workspace_id]/connections/[connection_id]/grants/route';
import { GET as getActivity } from '@/app/api/v1/workspaces/[workspace_id]/connections/[connection_id]/activity/route';
import { POST as postMassRevoke } from '@/app/internal/v1/connections/mass-revoke/route';
import { POST as postApiMassRevoke } from '@/app/api/internal/v1/connections/mass-revoke/route';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import * as envModule from '@/server/infrastructure/config/env';
import { getOpenApiSpec } from '@/server/infrastructure/openapi/spec';

const m = vi.hoisted(() => ({
  providers: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  reconnect: vi.fn(),
  test: vi.fn(),
  grants: vi.fn(),
  disconnect: vi.fn(),
  activity: vi.fn(),
  massRevoke: vi.fn(),
}));

vi.mock('@/server/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/container')>();
  return {
    ...actual,
    getListProvidersUseCase: () => ({ execute: m.providers }),
    getListConnectionsUseCase: () => ({ execute: m.list }),
    getGetConnectionUseCase: () => ({ execute: m.get }),
    getSaveApiKeyConnectionUseCase: () => ({ execute: m.save }),
    getReconnectConnectionUseCase: () => ({ execute: m.reconnect }),
    getTestConnectionUseCase: () => ({ execute: m.test }),
    getUpdateConnectionGrantsUseCase: () => ({ execute: m.grants }),
    getDisconnectConnectionUseCase: () => ({ execute: m.disconnect }),
    getListConnectionActivityUseCase: () => ({ execute: m.activity }),
    getMassRevokeConnectionsUseCase: () => ({ execute: m.massRevoke }),
  };
});

installHeaderSessionResolver();

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const CID = '33333333-3333-4333-8333-333333333333';
const BASE = `https://app.sineva.id/api/v1/workspaces/${WS}/connections`;
type Role = 'owner' | 'admin' | 'member' | 'viewer';

interface Over {
  role?: Role;
  ws?: string;
  unauth?: boolean;
  body?: unknown;
  headers?: Record<string, string>;
  query?: string;
}

function req(path: string, method: string, over: Over = {}) {
  return new NextRequest(`${BASE}${path}${over.query ?? ''}`, {
    method,
    headers: {
      ...(over.unauth ? { 'x-test-unauthenticated': 'true' } : {}),
      'x-test-session-user-id': 'usr-alpha',
      'x-test-session-role': over.role ?? 'owner',
      'x-test-session-workspaces': over.ws ?? WS,
      ...(over.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...over.headers,
    },
    ...(over.body !== undefined ? { body: JSON.stringify(over.body) } : {}),
  });
}

const p = { params: Promise.resolve({ workspace_id: WS, connection_id: CID }) };
const grantsBody = { grants: [{ agent_slug: 'sinopeople', read: true, write: false }] };
const secretBody = { provider_id: 'xendit', secret: { secret_key: 'xnd_development_abcdefghijklmnopqrstuvwxyz1234' } };

interface RouteCase {
  name: string;
  call: (o?: Over) => Promise<Response>;
  use: ReturnType<typeof vi.fn>;
  write: boolean;
  /** The lowest role that passes the route gate, and the role just below it. */
  denied: Role;
  allowed: Role;
}

const ROUTES: RouteCase[] = [
  { name: 'GET providers', call: (o) => getProviders(req('/providers', 'GET', o), p), use: m.providers, write: false, denied: 'viewer', allowed: 'viewer' },
  { name: 'GET list', call: (o) => getList(req('', 'GET', o), p), use: m.list, write: false, denied: 'viewer', allowed: 'viewer' },
  { name: 'GET one', call: (o) => getOne(req(`/${CID}`, 'GET', o), p), use: m.get, write: false, denied: 'viewer', allowed: 'viewer' },
  {
    name: 'POST secret',
    call: (o) => postSecret(req('/secret', 'POST', { body: secretBody, ...o }), p),
    use: m.save,
    write: true,
    denied: 'member',
    allowed: 'admin',
  },
  {
    name: 'POST reconnect',
    call: (o) => postReconnect(req(`/${CID}/reconnect`, 'POST', { body: {}, ...o }), p),
    use: m.reconnect,
    write: true,
    denied: 'viewer',
    allowed: 'member',
  },
  { name: 'POST test', call: (o) => postTest(req(`/${CID}/test`, 'POST', o), p), use: m.test, write: true, denied: 'viewer', allowed: 'member' },
  {
    name: 'PUT grants',
    call: (o) => putGrants(req(`/${CID}/grants`, 'PUT', { body: grantsBody, ...o }), p),
    use: m.grants,
    write: true,
    denied: 'member',
    allowed: 'admin',
  },
  { name: 'DELETE one', call: (o) => deleteOne(req(`/${CID}`, 'DELETE', o), p), use: m.disconnect, write: true, denied: 'viewer', allowed: 'member' },
  {
    name: 'GET activity',
    call: (o) => getActivity(req(`/${CID}/activity`, 'GET', o), p),
    use: m.activity,
    write: false,
    denied: 'member',
    allowed: 'admin',
  },
];

describe('Connections routes (WP-M2-17, R-25, FR-AUTH-24)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const route of ROUTES) route.use.mockResolvedValue({ ok: true, connection: { id: CID }, created: true, flow_id: 'f', authorization_url: 'https://x', expires_at: new Date('2026-10-23T10:00:00Z') });
  });

  describe.each(ROUTES)('$name', ({ call, use, write, denied, allowed }) => {
    it('401 without a session', async () => {
      const res = await call({ unauth: true });
      expect(res.status).toBe(401);
      expect(use).not.toHaveBeenCalled();
    });

    it(`403 for a ${denied} when the permission is missing, the gate passes a ${allowed}`, async () => {
      if (denied !== allowed) {
        const forbidden = await call({ role: denied });
        expect(forbidden.status).toBe(403);
        expect(use).not.toHaveBeenCalled();
      } else if (denied === 'viewer') {
        // Everyone may read: a viewer passes the gate.
        expect((await call({ role: 'viewer' })).status).toBeLessThan(400);
      }
      expect((await call({ role: allowed })).status).toBeLessThan(400);
    });

    it('404 for a workspace the caller is not in (never 403 for another tenant)', async () => {
      const res = await call({ ws: OTHER_WS });
      expect(res.status).toBe(404);
      expect(use).not.toHaveBeenCalled();
    });

    it('success: the envelope, and identity from the session and the URL', async () => {
      const res = await call({ role: 'owner' });
      expect(res.status).toBeLessThan(300);
      const json = await res.json();
      expect(json.meta.request_id).toBeTruthy();
      expect(json.data).toBeDefined();
      const input = use.mock.calls[0]![0];
      expect(input.context.user_id).toBe('usr-alpha');
      expect(input.context.workspace_id).toBe(WS);
    });

    if (write) {
      it('403 for a bearer token minted for another audience (session only)', async () => {
        const claims = Buffer.from(JSON.stringify({ aud: 'mcp' })).toString('base64url');
        const res = await call({ headers: { authorization: `Bearer h.${claims}.s` } });
        expect(res.status).toBe(403);
        expect(use).not.toHaveBeenCalled();
      });
    }
  });

  describe('validation (422) and path ids', () => {
    it('a malformed connection id is a 404, like an unknown one, before any use case runs', async () => {
      const bad = { params: Promise.resolve({ workspace_id: WS, connection_id: 'not-a-uuid' }) };
      expect((await getOne(req('/not-a-uuid', 'GET'), bad)).status).toBe(404);
      expect((await deleteOne(req('/not-a-uuid', 'DELETE'), bad)).status).toBe(404);
      expect((await putGrants(req('/not-a-uuid/grants', 'PUT', { body: grantsBody }), bad)).status).toBe(404);
      expect(m.get).not.toHaveBeenCalled();
      expect(m.disconnect).not.toHaveBeenCalled();
    });

    it('POST secret: strict body, no user or workspace key, a secret map of strings only', async () => {
      const post = (body: unknown) => postSecret(req('/secret', 'POST', { body }), p);
      expect((await post({})).status).toBe(422);
      expect((await post({ provider_id: 'xendit' })).status).toBe(422);
      expect((await post({ ...secretBody, workspace_id: OTHER_WS })).status).toBe(422);
      expect((await post({ ...secretBody, user_id: 'someone' })).status).toBe(422);
      expect((await post({ provider_id: 'xendit', secret: { secret_key: 123 } })).status).toBe(422);
      expect((await post({ provider_id: 'xendit', secret: 'abc' })).status).toBe(422);
      expect((await post({ ...secretBody, connection_id: 'nope' })).status).toBe(422);
      expect(m.save).not.toHaveBeenCalled();
    });

    it('POST secret: 201 for a new connection and 200 for a replaced key, and the key never comes back', async () => {
      m.save.mockResolvedValueOnce({ connection: { id: CID }, created: true });
      const created = await postSecret(req('/secret', 'POST', { body: secretBody }), p);
      expect(created.status).toBe(201);
      expect(JSON.stringify(await created.json())).not.toContain('xnd_development');
      m.save.mockResolvedValueOnce({ connection: { id: CID }, created: false });
      expect((await postSecret(req('/secret', 'POST', { body: { ...secretBody, connection_id: CID } }), p)).status).toBe(200);
      expect(m.save.mock.calls[1]![0]).toMatchObject({ connection_id: CID });
    });

    it('PUT grants: the body must be a list of read and write booleans, and nothing else', async () => {
      const put = (body: unknown) => putGrants(req(`/${CID}/grants`, 'PUT', { body }), p);
      expect((await put({})).status).toBe(422);
      expect((await put({ grants: 'all' })).status).toBe(422);
      expect((await put({ grants: [{ agent_slug: 'sinopeople', read: 'yes', write: false }] })).status).toBe(422);
      expect((await put({ grants: [{ agent_slug: 'sinopeople', read: true, write: false, user_id: 'x' }] })).status).toBe(422);
      expect((await put({ ...grantsBody, workspace_id: OTHER_WS })).status).toBe(422);
      expect(m.grants).not.toHaveBeenCalled();
      expect((await put({ grants: [] })).status).toBe(200);
    });

    it('POST reconnect: optional strict body', async () => {
      const post = (body?: unknown) => postReconnect(req(`/${CID}/reconnect`, 'POST', body === undefined ? {} : { body }), p);
      expect((await post()).status).toBe(200);
      expect((await post({ scope_bundle: 'calendar_events', return_to: '/w/acme/connections' })).status).toBe(200);
      expect((await post({ owner_scope: 'user' })).status).toBe(422);
      expect(m.reconnect.mock.calls[1]![0]).toMatchObject({ scope_bundle: 'calendar_events', return_to: '/w/acme/connections' });
      // The authorization URL is a string and the expiry is ISO.
      const res = await post();
      expect((await res.json()).data.expires_at).toBe('2026-10-23T10:00:00.000Z');
    });

    it('GET list: filters are validated; GET activity: limit is bounded', async () => {
      expect((await getList(req('', 'GET', { query: '?status=gone' }), p)).status).toBe(422);
      expect((await getList(req('', 'GET', { query: '?provider_id=notion&status=connected' }), p)).status).toBe(200);
      expect(m.list.mock.calls[0]![0]).toMatchObject({ provider_id: 'notion', status: 'connected' });
      expect((await getActivity(req(`/${CID}/activity`, 'GET', { query: '?limit=500' }), p)).status).toBe(422);
      expect((await getActivity(req(`/${CID}/activity`, 'GET', { query: '?limit=10&cursor=2026-10-23T10:00:00.000Z' }), p)).status).toBe(200);
      expect(m.activity.mock.calls[0]![0]).toMatchObject({ limit: 10, cursor: '2026-10-23T10:00:00.000Z' });
    });
  });

  it('a use case that does not find the connection answers 404 with the envelope', async () => {
    m.get.mockRejectedValueOnce(new NotFoundError('Connection', CID));
    const res = await getOne(req(`/${CID}`, 'GET'), p);
    expect(res.status).toBe(404);
    expect((await res.json()).errors[0].code).toBeTruthy();
  });

  it('a domain error from a use case keeps its specific code in errors[0]', async () => {
    const { ConnectionTestFailedError } = await import('@/server/domain/connections/connection_errors');
    m.save.mockRejectedValueOnce(new ConnectionTestFailedError('invalid_credentials'));
    const res = await postSecret(req('/secret', 'POST', { body: secretBody }), p);
    expect(res.status).toBe(422);
    expect((await res.json()).errors[0]).toMatchObject({ code: 'connection_test_failed', field: 'secret', detail: 'invalid_credentials' });
  });

  describe('every route is in the OpenAPI document (R-25)', () => {
    const paths = Object.keys((getOpenApiSpec().paths ?? {}) as Record<string, unknown>);
    it.each([
      '/api/v1/workspaces/{workspace_id}/connections',
      '/api/v1/workspaces/{workspace_id}/connections/providers',
      '/api/v1/workspaces/{workspace_id}/connections/secret',
      '/api/v1/workspaces/{workspace_id}/connections/oauth/start',
      '/api/v1/workspaces/{workspace_id}/connections/{connection_id}',
      '/api/v1/workspaces/{workspace_id}/connections/{connection_id}/reconnect',
      '/api/v1/workspaces/{workspace_id}/connections/{connection_id}/test',
      '/api/v1/workspaces/{workspace_id}/connections/{connection_id}/grants',
      '/api/v1/workspaces/{workspace_id}/connections/{connection_id}/activity',
      '/api/v1/connections/oauth/callback',
      '/internal/v1/connections/mass-revoke',
      '/api/internal/v1/connections/mass-revoke',
    ])('%s', (path) => {
      expect(paths).toContain(path);
    });
  });
});

describe('POST /internal/v1/connections/mass-revoke', () => {
  const KEY = 'test-secret-key-primary';
  beforeEach(() => {
    vi.clearAllMocks();
    m.massRevoke.mockResolvedValue({ revoked: 3, more: false });
    vi.spyOn(envModule, 'getEnvConfig').mockReturnValue({ ai_engine_internal_api_key: KEY } as ReturnType<typeof envModule.getEnvConfig>);
  });

  const request = (path: string, body: unknown, key: string | null = KEY) =>
    new NextRequest(`http://localhost:3000${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { 'x-internal-api-key': key } : {}) },
      body: JSON.stringify(body),
    });
  const good = { provider_id: 'google_calendar', confirm: 'revoke-all:google_calendar' };

  it.each([
    ['/internal/v1/connections/mass-revoke', postMassRevoke],
    ['/api/internal/v1/connections/mass-revoke', postApiMassRevoke],
  ])('%s: needs the internal key and a valid body', async (path, handler) => {
    expect((await handler(request(path, good, null))).status).toBe(401);
    expect((await handler(request(path, good, 'nope'))).status).toBe(401);
    expect((await handler(request(path, {}))).status).toBe(422);
    expect((await handler(request(path, { ...good, limit: 0 }))).status).toBe(422);
    expect((await handler(request(path, { ...good, limit: 201 }))).status).toBe(422);
    expect((await handler(request(path, { ...good, workspace_id: 'x' }))).status).toBe(422);
    expect(m.massRevoke).not.toHaveBeenCalled();

    const ok = await handler(request(path, good));
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toEqual({ revoked: 3, more: false });
    expect(m.massRevoke).toHaveBeenLastCalledWith({ ...good, limit: 100 });
  });
});
