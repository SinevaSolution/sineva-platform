import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/client/lib/api';
import {
  createConnectionsApi,
  mapConnection,
  mapProvider,
  type WireConnection,
  type WireProvider,
} from '@/client/lib/connections_api';

const WS = '00000000-0000-4000-8000-000000000001';
const BASE = `/api/v1/workspaces/${WS}/connections`;

// Wire fixtures follow docs/api-spec/connections_endpoints.md (backend, v1.0.0).
const wireScope = (access_class: 'read' | 'write', key: string, en: string, id: string) => ({
  scope_key: key,
  label: { en, id },
  access_class,
});

const wireProvider = (patch: Record<string, unknown> = {}): WireProvider => ({
  provider_id: 'mekari_jurnal',
  display_name: 'Mekari Jurnal',
  category: 'accounting',
  status: 'available',
  available: true,
  unavailable_reason: null,
  auth_type: 'oauth2_pkce',
  personal_capable: false,
  description: { en: 'Reads invoices', id: 'Membaca faktur' },
  specialists: ['sinofinance'],
  scope_bundles: [
    { bundle_key: 'read', label: { en: 'Read', id: 'Baca' }, access_class: 'read', scopes: [wireScope('read', 'r', 'Read invoices', 'Baca faktur')] },
    { bundle_key: 'read_write', label: { en: 'Read and change', id: 'Baca dan ubah' }, access_class: 'write', scopes: [wireScope('read', 'r', 'Read invoices', 'Baca faktur'), wireScope('write', 'w', 'Create drafts', 'Buat draf')] },
  ],
  credential_fields: [],
  can_connect_workspace: true,
  can_connect_personal: false,
  ...patch,
} as unknown as WireProvider);

const wireConnection = (patch: Record<string, unknown> = {}): WireConnection => ({
  id: 'c-1',
  provider_id: 'mekari_jurnal',
  owner_scope: 'workspace',
  is_mine: false,
  status: 'connected',
  auth_type: 'oauth2_pkce',
  account_label: 'budi@kopisenja.id',
  scope_bundle: 'read',
  granted_scopes: [wireScope('read', 'r', 'Read invoices', 'Baca faktur')],
  missing_scopes: [],
  last_health_at: '2026-10-21T08:14:00Z',
  last_error_code: null,
  secret_rotation_due_at: null,
  created_at: '2026-10-12T08:00:00Z',
  updated_at: '2026-10-12T08:00:00Z',
  revoked_at: null,
  grants: [
    { agent_slug: 'sinofinance', read: true, write: true },
    { agent_slug: 'sinoinsights', read: true, write: false },
    { agent_slug: 'sinosales', read: false, write: false },
  ],
  can: { grant: true, disconnect: true, reconnect: true, test: true, view_activity: true },
  ...patch,
} as unknown as WireConnection);

const fetchMock = vi.fn();
const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), { status });
const fail = (status: number, code: string, errors: Array<{ code: string; field?: string }> = []) =>
  new Response(JSON.stringify({ success: false, code, message: 'internal text', errors }), { status });

beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockReset();
});

const calls = () =>
  fetchMock.mock.calls.map(([url, init]) => ({
    url: url as string,
    init: init as RequestInit,
    body: (init as RequestInit).body ? JSON.parse((init as RequestInit).body as string) : undefined,
  }));
const lastCall = () => calls().at(-1)!;

// Routes by path, so the order of the parallel provider and connection reads does not matter.
function route(handlers: Record<string, () => Response>) {
  fetchMock.mockImplementation(async (url: string) => {
    const path = url.split('?')[0]!.replace(BASE, '') || '/';
    const handler = handlers[path];
    if (!handler) throw new Error(`unexpected request ${url}`);
    return handler();
  });
}

describe('wire to view mapping', () => {
  it('maps a provider: id, localized text, tiers, availability and the knowledge category', () => {
    const view = mapProvider(wireProvider({ provider_id: 'notion', display_name: 'Notion', category: 'knowledge' }));
    expect(view.slug).toBe('notion');
    expect(view.category).toBe('docs');
    expect(view.auth_type).toBe('oauth');
    expect(view.description_id).toBe('Membaca faktur');
    expect(view.bundles.map((b) => [b.key, b.access_class])).toEqual([
      ['read', 'read'],
      ['read_write', 'write'],
    ]);
    expect(view.bundles[1]!.scopes[1]).toEqual({ key: 'w', label_en: 'Create drafts', label_id: 'Buat draf', access_class: 'write' });
    expect(view.write_supported).toBe(true);
    expect(view.availability).toBe('available');
  });

  it.each([
    [{ status: 'beta' }, 'beta'],
    [{ status: 'coming_soon', available: false, unavailable_reason: 'coming_soon' }, 'coming_soon'],
    [{ available: false, unavailable_reason: 'credentials_not_configured' }, 'credentials_missing'],
  ])('availability %# is %s', (patch, expected) => {
    expect(mapProvider(wireProvider(patch)).availability).toBe(expected);
  });

  it('a provider with only a read tier is read only, and a payments one shows the notice', () => {
    const view = mapProvider(
      wireProvider({
        provider_id: 'xendit',
        category: 'payments',
        auth_type: 'api_key',
        scope_bundles: [{ bundle_key: 'read', label: { en: 'r', id: 'r' }, access_class: 'read', scopes: [] }],
        credential_fields: [
          { field_key: 'secret_key', label: { en: 'Secret API key', id: 'Secret API key' }, kind: 'secret' },
          { field_key: 'environment', label: { en: 'Environment', id: 'Lingkungan' }, kind: 'choice', choices: ['sandbox', 'production'] },
        ],
      }),
    );
    expect(view.write_supported).toBe(false);
    expect(view.read_only_notice).toBe(true);
    expect(view.auth_type).toBe('api_key');
    expect(view.credential_fields.map((f) => [f.field_key, f.kind, f.choices])).toEqual([
      ['secret_key', 'secret', []],
      ['environment', 'choice', ['sandbox', 'production']],
    ]);
  });

  it('an auth type this client does not know cannot be connected from here', () => {
    expect(mapProvider(wireProvider({ auth_type: 'carrier_pigeon' })).auth_type).toBe('embedded_signup');
  });

  it('maps a connection: write implies read, none is a row with both false, names come from the catalog', () => {
    const provider = mapProvider(wireProvider());
    const view = mapConnection(wireConnection({ is_mine: true }), { ...provider, short_name: 'Jurnal' });
    expect(view.owned_by_me).toBe(true);
    expect(view.provider_slug).toBe('mekari_jurnal');
    expect(view.provider_name).toBe('Mekari Jurnal');
    expect(view.grants.map((g) => [g.agent_slug, g.access_level])).toEqual([
      ['sinofinance', 'write'],
      ['sinoinsights', 'read'],
      ['sinosales', 'none'],
    ]);
    expect(view.connected_at).toBe('2026-10-12T08:00:00Z');
    expect(view.can.grant).toBe(true);
  });
});

describe('connections api client', () => {
  it('lists providers under the workspace path', async () => {
    route({ '/providers': () => ok({ providers: [wireProvider()] }) });
    const providers = await createConnectionsApi(WS).listProviders();
    expect(providers[0]!.slug).toBe('mekari_jurnal');
    expect(lastCall().url).toBe(`${BASE}/providers`);
    expect(lastCall().init.method).toBe('GET');
  });

  it('lists connections with the provider name joined from the catalog', async () => {
    route({
      '/': () => ok({ connections: [wireConnection()] }),
      '/providers': () => ok({ providers: [wireProvider()] }),
    });
    const list = await createConnectionsApi(WS).listConnections();
    expect(list[0]!.provider_name).toBe('Mekari Jurnal');
    expect(list[0]!.grants[0]).toEqual({ agent_slug: 'sinofinance', access_level: 'write' });
  });

  it('reads the catalog once for a burst of calls', async () => {
    route({
      '/': () => ok({ connections: [] }),
      '/c-1': () => ok({ connection: wireConnection() }),
      '/providers': () => ok({ providers: [wireProvider()] }),
    });
    const api = createConnectionsApi(WS);
    await Promise.all([api.listProviders(), api.listConnections(), api.getConnection('c-1')]);
    expect(calls().filter((c) => c.url.endsWith('/providers'))).toHaveLength(1);
  });

  it('does not serve a failed catalog read again', async () => {
    fetchMock.mockResolvedValueOnce(fail(503, 'dependency_unavailable'));
    const api = createConnectionsApi(WS);
    await expect(api.listProviders()).rejects.toBeInstanceOf(ApiError);
    fetchMock.mockResolvedValueOnce(ok({ providers: [wireProvider()] }));
    expect(await api.listProviders()).toHaveLength(1);
  });

  it('reads one connection by id and url-encodes the id', async () => {
    route({
      '/a%2Fb': () => ok({ connection: wireConnection() }),
      '/providers': () => ok({ providers: [] }),
    });
    const view = await createConnectionsApi(WS).getConnection('a/b');
    expect(view.id).toBe('c-1');
    expect(view.provider_name).toBe('mekari_jurnal');
  });

  it('starts a sign-in with one tier, no identity in the body, and returns the provider URL', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ flow_id: 'f', authorization_url: 'https://provider.example/authorize', expires_at: 'x' }),
    );
    const url = await createConnectionsApi(WS).startOAuth({
      provider: 'mekari_jurnal',
      owner_scope: 'workspace',
      bundle_key: 'read',
      return_to: '/w/acme/tools/result',
    });
    expect(url).toBe('https://provider.example/authorize');
    const { url: path, init, body } = lastCall();
    expect(path).toBe(`${BASE}/oauth/start`);
    expect(init.method).toBe('POST');
    expect(body).toEqual({
      provider_id: 'mekari_jurnal',
      scope_bundle: 'read',
      owner_scope: 'workspace',
      return_to: '/w/acme/tools/result',
    });
    expect(JSON.stringify(body)).not.toContain(WS);
    expect((init.headers as Record<string, string>)['x-sineva-action']).toBe('1');
  });

  it('sends a key only in the body, never in the url, and joins the provider name on the answer', async () => {
    route({
      '/secret': () => ok({ connection: wireConnection({ provider_id: 'xendit' }) }, 201),
      '/providers': () => ok({ providers: [wireProvider({ provider_id: 'xendit', display_name: 'Xendit' })] }),
    });
    const view = await createConnectionsApi(WS).saveSecret({
      provider: 'xendit',
      secret: { secret_key: 'xnd_secret_value', environment: 'production' },
      owner_scope: 'workspace',
      connection_id: null,
    });
    expect(view.provider_name).toBe('Xendit');
    const post = calls().find((c) => c.url.endsWith('/secret'))!;
    expect(post.url).not.toContain('xnd_secret_value');
    expect(post.body).toEqual({
      provider_id: 'xendit',
      owner_scope: 'workspace',
      secret: { secret_key: 'xnd_secret_value', environment: 'production' },
    });
    expect(post.body).not.toHaveProperty('dry_run');
  });

  it('replacing a key names the connection', async () => {
    route({
      '/secret': () => ok({ connection: wireConnection() }),
      '/providers': () => ok({ providers: [] }),
    });
    await createConnectionsApi(WS).saveSecret({
      provider: 'xendit',
      secret: { secret_key: 'new' },
      owner_scope: 'workspace',
      connection_id: 'c-1',
    });
    expect(calls().find((c) => c.url.endsWith('/secret'))!.body.connection_id).toBe('c-1');
  });

  it('reconnects with the chosen tier, tests, saves grants as booleans and disconnects', async () => {
    const api = createConnectionsApi(WS);

    fetchMock.mockResolvedValueOnce(ok({ authorization_url: 'https://provider.example/a' }));
    expect(await api.reconnect('c-1', { return_to: '/w/acme/tools/result', bundle_key: 'read_write' })).toBe(
      'https://provider.example/a',
    );
    expect(lastCall().url).toBe(`${BASE}/c-1/reconnect`);
    expect(lastCall().body).toEqual({ return_to: '/w/acme/tools/result', scope_bundle: 'read_write' });

    fetchMock.mockResolvedValueOnce(ok({ result: 'failed', status: 'needs_reconnect', error_code: 'x', checked_at: 't' }));
    expect(await api.testConnection('c-1')).toEqual({ ok: false, checked_at: 't', status: 'needs_reconnect' });
    expect(lastCall().url).toBe(`${BASE}/c-1/test`);

    fetchMock.mockResolvedValueOnce(
      ok({ grants: [{ agent_slug: 'sinofinance', read: true, write: true }, { agent_slug: 'sinosales', read: false, write: false }] }),
    );
    const saved = await api.updateGrants('c-1', [
      { agent_slug: 'sinofinance', access_level: 'write' },
      { agent_slug: 'sinosales', access_level: 'none' },
    ]);
    expect(lastCall().init.method).toBe('PUT');
    expect(lastCall().body).toEqual({
      grants: [
        { agent_slug: 'sinofinance', read: true, write: true },
        { agent_slug: 'sinosales', read: false, write: false },
      ],
    });
    expect(saved).toEqual([
      { agent_slug: 'sinofinance', access_level: 'write' },
      { agent_slug: 'sinosales', access_level: 'none' },
    ]);

    fetchMock.mockResolvedValueOnce(ok({ id: 'c-1', status: 'revoked', revoked_at: 't', provider_revoked: false }));
    expect(await api.disconnect('c-1')).toEqual({ provider_revoked: false });
    expect(lastCall().init.method).toBe('DELETE');
    expect(lastCall().url).toBe(`${BASE}/c-1`);
  });

  it('pages activity with a cursor and maps events', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        events: [{ id: 'e1', occurred_at: 't', action: 'connection.created', outcome: null, actor_type: 'user', reason_code: null }],
        next_cursor: 'n',
      }),
    );
    const page = await createConnectionsApi(WS).listActivity('abc', 'cur sor');
    expect(lastCall().url).toBe(`${BASE}/abc/activity?cursor=cur%20sor`);
    expect(page).toEqual({ items: [{ id: 'e1', occurred_at: 't', action: 'connection.created', outcome: null }], next_cursor: 'n' });
  });

  it('turns a failed call into an ApiError that carries the specific code', async () => {
    fetchMock.mockResolvedValueOnce(
      fail(422, 'validation_failed', [{ code: 'connection_test_failed', field: 'secret' }]),
    );
    const error = await createConnectionsApi(WS)
      .saveSecret({ provider: 'xendit', secret: { secret_key: 'x' }, owner_scope: 'workspace', connection_id: null })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).detailCodes).toEqual(['connection_test_failed']);
  });
});
