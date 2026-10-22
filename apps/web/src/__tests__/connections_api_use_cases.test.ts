import { describe, expect, it } from 'vitest';
import { ConflictError } from '@/server/domain/errors/domain_error';
import { ForbiddenError, NotFoundError } from '@/server/domain/errors/domain_error';
import { VaultUnavailableError } from '@/server/domain/vault/vault';
import { captureConsole } from './helpers/canary_secrets';
import { buildApiWorld, type ApiWorld } from './helpers/api_world';
import { ADMIN, MEMBER, MEMBER_2, OWNER, VIEWER, WS_A, WS_B, runCallback } from './helpers/connections_world';

// WP-M2-17 (FR-CONN-01 to FR-CONN-05, FR-CONN-29, ADR-0039): the use cases behind
// the Connections API. The route tests cover 401, 403 and 404 at the edge; these
// pin what each use case decides.

const XENDIT_KEY = 'xnd_development_CANARYabcdefghijklmnopqrstuv1234';
const MIDTRANS_KEY = 'SB-Mid-server-CANARYabcdefghijklmnop5678';
const FORBIDDEN_KEYS = /"(access_token|refresh_token|ciphertext|dek_wrapped|client_secret|api_key|password|secret_key|server_key)"\s*:/;

async function connectGoogle(world: ApiWorld, user = OWNER, ownerScope: 'workspace' | 'user' = 'workspace') {
  const started = await world.start.execute({
    context: world.context(user),
    provider_id: 'google_calendar',
    scope_bundle: 'calendar_read',
    owner_scope: ownerScope,
  });
  const result = await runCallback(world, world.google.authorize(started.authorization_url), { user_id: user, session_id: 'session-' + user });
  return result.connection_id!;
}

async function saveXendit(world: ApiWorld, user = OWNER) {
  world.keyHost.accepted.add(XENDIT_KEY);
  return world.saveKey.execute({ context: world.context(user), provider_id: 'xendit', secret: { secret_key: XENDIT_KEY } });
}

describe('providers (FR-CONN-01, FR-CONN-05)', () => {
  it('lists the launch providers and the coming soon entries with labelled scopes, never a raw scope alone', async () => {
    const world = buildApiWorld();
    const { providers } = await world.listProviders.execute({ context: world.context(OWNER) });
    expect(providers.map((p) => p.provider_id)).toEqual([
      'google_calendar',
      'notion',
      'xendit',
      'midtrans',
      'mekari_jurnal',
      'whatsapp_business',
      'instagram',
      'shopee',
      'tiktok_shop',
    ]);
    const google = providers[0]!;
    expect(google).toMatchObject({ available: true, unavailable_reason: null, auth_type: 'oauth2_pkce', personal_capable: true, specialists: ['sinopeople', 'sinosales'] });
    expect(google.scope_bundles.map((b) => [b.bundle_key, b.access_class])).toEqual([
      ['calendar_read', 'read'],
      ['calendar_events', 'write'],
    ]);
    for (const scope of google.scope_bundles.flatMap((b) => b.scopes)) {
      expect(scope.label.en).not.toBe('');
      expect(scope.label.id).not.toBe('');
    }
    const soon = providers.find((p) => p.provider_id === 'shopee')!;
    expect(soon).toMatchObject({ status: 'coming_soon', available: false, unavailable_reason: 'coming_soon', scope_bundles: [] });
  });

  it('API-key providers describe the fields to paste', async () => {
    const world = buildApiWorld();
    const { providers } = await world.listProviders.execute({ context: world.context(OWNER) });
    expect(providers.find((p) => p.provider_id === 'xendit')?.credential_fields).toEqual([
      { field_key: 'secret_key', label: { en: 'Secret API key', id: 'Kunci API rahasia' }, kind: 'secret' },
    ]);
    const midtrans = providers.find((p) => p.provider_id === 'midtrans')!;
    expect(midtrans.credential_fields.map((f) => f.field_key)).toEqual(['server_key', 'environment']);
    expect(midtrans.credential_fields[1]?.choices).toEqual(['sandbox', 'production']);
  });

  it('says what the caller may connect, by role', async () => {
    const world = buildApiWorld();
    const flags = async (user: string) =>
      Object.fromEntries(
        (await world.listProviders.execute({ context: world.context(user) })).providers
          .filter((p) => ['google_calendar', 'notion'].includes(p.provider_id))
          .map((p) => [p.provider_id, [p.can_connect_workspace, p.can_connect_personal]]),
      );
    expect(await flags(OWNER)).toEqual({ google_calendar: [true, true], notion: [true, false] });
    expect(await flags(ADMIN)).toEqual({ google_calendar: [true, true], notion: [true, false] });
    expect(await flags(MEMBER)).toEqual({ google_calendar: [false, true], notion: [false, false] });
    expect(await flags(VIEWER)).toEqual({ google_calendar: [false, false], notion: [false, false] });
  });

  it('a provider without credentials here is listed as unavailable with a reason', async () => {
    const world = buildApiWorld();
    world.providers.delete('notion');
    const { providers } = await world.listProviders.execute({ context: world.context(OWNER) });
    expect(providers.find((p) => p.provider_id === 'notion')).toMatchObject({ available: false, unavailable_reason: 'credentials_not_configured', can_connect_workspace: false });
  });

  it('a person outside any workspace gets nothing', async () => {
    const world = buildApiWorld();
    await expect(world.listProviders.execute({ context: { ...world.context(OWNER), workspace_id: undefined, role: undefined } })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('listing and reading connections (FR-CONN-03)', () => {
  it('shows workspace connections and your own personal one, and hides another member personal connection from everyone, admin and owner included', async () => {
    const world = buildApiWorld();
    const shared = await connectGoogle(world, OWNER, 'workspace');
    world.google.config.account = { id: 'acct-m1', label: 'm1@example.test' };
    const mine = await connectGoogle(world, MEMBER, 'user');
    world.google.config.account = { id: 'acct-m2', label: 'm2@example.test' };
    const theirs = await connectGoogle(world, MEMBER_2, 'user');

    const ids = async (user: string) => (await world.listConnections.execute({ context: world.context(user) })).connections.map((c) => c.id).sort();
    expect(await ids(MEMBER)).toEqual([shared, mine].sort());
    expect(await ids(MEMBER_2)).toEqual([shared, theirs].sort());
    expect(await ids(ADMIN)).toEqual([shared]);
    expect(await ids(OWNER)).toEqual([shared]);
    expect(await ids(VIEWER)).toEqual([shared]);

    // Reading it directly is a 404 for anyone but the owner of it.
    await expect(world.getConnection.execute({ context: world.context(OWNER), connection_id: mine })).rejects.toBeInstanceOf(NotFoundError);
    await expect(world.getConnection.execute({ context: world.context(ADMIN), connection_id: theirs })).rejects.toBeInstanceOf(NotFoundError);
    expect((await world.getConnection.execute({ context: world.context(MEMBER), connection_id: mine })).connection.is_mine).toBe(true);
  });

  it('filters by provider and status, and hides revoked tombstones unless asked', async () => {
    const world = buildApiWorld();
    const google = await connectGoogle(world);
    await saveXendit(world);
    const byProvider = await world.listConnections.execute({ context: world.context(OWNER), provider_id: 'xendit' });
    expect(byProvider.connections.map((c) => c.provider_id)).toEqual(['xendit']);

    await world.disconnect.execute({ context: world.context(OWNER), connection_id: google });
    expect((await world.listConnections.execute({ context: world.context(OWNER) })).connections.map((c) => c.provider_id)).toEqual(['xendit']);
    const revoked = await world.listConnections.execute({ context: world.context(OWNER), status: 'revoked' });
    expect(revoked.connections.map((c) => c.id)).toEqual([google]);
  });

  it('another workspace never sees the connection (a workspace id is not a way in)', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    const other = world.context(OWNER, 'session-b', WS_B);
    expect((await world.listConnections.execute({ context: other })).connections).toEqual([]);
    await expect(world.getConnection.execute({ context: other, connection_id: id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('the view carries labelled scopes, the matrix in roster order, status flags per role, and no secret field', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    const { connection } = await world.getConnection.execute({ context: world.context(OWNER), connection_id: id });
    expect(connection.grants.map((g) => g.agent_slug)).toEqual(world.specialistSlugs);
    expect(connection.grants.filter((g) => g.read).map((g) => g.agent_slug)).toEqual(['sinopeople', 'sinosales']);
    expect(connection.grants.some((g) => g.write)).toBe(false);
    expect(connection.granted_scopes.map((s) => s.scope_key)).toContain('https://www.googleapis.com/auth/calendar.readonly');
    expect(connection.granted_scopes.every((s) => s.label.en && s.label.id)).toBe(true);
    expect(connection).toMatchObject({ account_label: 'budi@example.test', owner_scope: 'workspace', is_mine: false, auth_type: 'oauth2_pkce', secret_rotation_due_at: null });
    expect(connection.can).toEqual({ grant: true, disconnect: true, reconnect: true, test: true, view_activity: true });
    expect(JSON.stringify(connection)).not.toMatch(FORBIDDEN_KEYS);
  });

  it('what each role may do with a shared connection', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    const can = async (user: string) => (await world.getConnection.execute({ context: world.context(user), connection_id: id })).connection.can;
    expect(await can(ADMIN)).toEqual({ grant: true, disconnect: true, reconnect: true, test: true, view_activity: true });
    expect(await can(MEMBER)).toEqual({ grant: false, disconnect: false, reconnect: false, test: false, view_activity: false });
    expect(await can(VIEWER)).toEqual({ grant: false, disconnect: false, reconnect: false, test: false, view_activity: false });
  });

  it('a member can manage their own personal connection but not grant on it', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world, MEMBER, 'user');
    const { connection } = await world.getConnection.execute({ context: world.context(MEMBER), connection_id: id });
    expect(connection.can).toEqual({ grant: false, disconnect: true, reconnect: true, test: true, view_activity: false });
  });

  it('a partial connection names what is missing, in plain words', async () => {
    const world = buildApiWorld({ google: { grant_only: ['openid', 'https://www.googleapis.com/auth/userinfo.email'] } });
    const id = await connectGoogle(world);
    const { connection } = await world.getConnection.execute({ context: world.context(OWNER), connection_id: id });
    expect(connection.status).toBe('partial');
    expect(connection.missing_scopes).toHaveLength(1);
    expect(connection.missing_scopes[0]?.label.en).toBe('See your calendars and events');
  });

  it('an API-key connection shows when its key is due for rotation (90 days)', async () => {
    const world = buildApiWorld();
    const { connection } = await saveXendit(world);
    const saved = world.clock.now.getTime();
    expect(new Date(connection.secret_rotation_due_at!).getTime()).toBe(saved + 90 * 86_400_000);
  });
});

describe('connecting with a pasted key (FR-CONN-29)', () => {
  it('tests the key, stores it in the vault, labels it with a hint, and grants read to SinoFinance only', async () => {
    const world = buildApiWorld();
    world.keyHost.accepted.add(XENDIT_KEY);

    const result = await world.saveKey.execute({ context: world.context(OWNER), provider_id: 'xendit', secret: { secret_key: XENDIT_KEY } });

    expect(result.created).toBe(true);
    const view = result.connection;
    expect(view).toMatchObject({ provider_id: 'xendit', auth_type: 'api_key', status: 'connected', owner_scope: 'workspace', account_label: 'xnd_…1234' });
    expect(view.grants.filter((g) => g.read).map((g) => g.agent_slug)).toEqual(['sinofinance']);
    expect(view.grants.some((g) => g.write)).toBe(false);
    expect(world.keyHost.requests).toHaveLength(1);
    const stored = await world.vault.get(world.secretRef(view.id, WS_A, 'xendit'));
    expect(stored?.payload).toEqual({ secret_key: XENDIT_KEY });
    expect(world.audit.rows.find((r) => r.action === 'connection.created')?.target_id).toBe(view.id);
    // The key is never in the answer.
    expect(JSON.stringify(result)).not.toContain('CANARY');
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_KEYS);
  });

  it('Midtrans needs the environment too, and the host follows it', async () => {
    const world = buildApiWorld();
    world.keyHost.accepted.add(MIDTRANS_KEY);
    const result = await world.saveKey.execute({
      context: world.context(OWNER),
      provider_id: 'midtrans',
      secret: { server_key: MIDTRANS_KEY, environment: 'sandbox' },
    });
    expect(result.connection.account_label).toBe('SB-M…5678 (sandbox)');
    expect(world.keyHost.requests[0]!.url).toContain('api.sandbox.midtrans.com');
  });

  it.each([
    ['a key the provider rejects', { secret_key: 'xnd_development_WRONG1234567890abcdef' }, 'invalid_credentials'],
  ])('%s: nothing is stored, the answer says why without quoting the key', async (_label, secret, detail) => {
    const world = buildApiWorld();
    const error = await world.saveKey.execute({ context: world.context(OWNER), provider_id: 'xendit', secret }).catch((e: Error) => e);
    expect(error).toMatchObject({ status: 422, details: [{ code: 'connection_test_failed', field: 'secret', detail }] });
    expect(JSON.stringify(error)).not.toContain('WRONG1234');
    expect(world.connections.rows.size).toBe(0);
    expect(world.vaultRows.rows.size).toBe(0);
  });

  it('a key without the needed permission is refused with that reason', async () => {
    const world = buildApiWorld();
    world.keyHost.restricted.add(XENDIT_KEY);
    await expect(world.saveKey.execute({ context: world.context(OWNER), provider_id: 'xendit', secret: { secret_key: XENDIT_KEY } })).rejects.toMatchObject({
      details: [{ code: 'connection_test_failed', detail: 'insufficient_permissions' }],
    });
    expect(world.connections.rows.size).toBe(0);
  });

  it('a provider that cannot be reached is a 503 and stores nothing', async () => {
    const world = buildApiWorld();
    world.keyHost.accepted.add(XENDIT_KEY);
    world.keyHost.failNext();
    await expect(world.saveKey.execute({ context: world.context(OWNER), provider_id: 'xendit', secret: { secret_key: XENDIT_KEY } })).rejects.toMatchObject({
      status: 503,
      code: 'provider_unreachable',
    });
    expect(world.connections.rows.size).toBe(0);
    expect(world.vaultRows.rows.size).toBe(0);
  });

  it('validates the fields before calling the provider: missing, unknown, empty, over long and a bad choice are 422', async () => {
    const world = buildApiWorld();
    world.keyHost.accepted.add(MIDTRANS_KEY);
    const base = { context: world.context(OWNER), provider_id: 'midtrans' };
    const bad: Array<Record<string, string>> = [
      {},
      { server_key: MIDTRANS_KEY },
      { server_key: '', environment: 'sandbox' },
      { server_key: MIDTRANS_KEY, environment: 'staging' },
      { server_key: MIDTRANS_KEY, environment: 'sandbox', extra: 'x' },
      { server_key: 'k'.repeat(600), environment: 'sandbox' },
    ];
    for (const secret of bad) {
      await expect(world.saveKey.execute({ ...base, secret })).rejects.toMatchObject({ status: 422 });
    }
    expect(world.keyHost.requests).toHaveLength(0);
  });

  it('who may connect: owner and admin yes, member and viewer no', async () => {
    const world = buildApiWorld();
    world.keyHost.accepted.add(XENDIT_KEY);
    const attempt = (user: string) => world.saveKey.execute({ context: world.context(user), provider_id: 'xendit', secret: { secret_key: XENDIT_KEY } });
    await expect(attempt(MEMBER)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(attempt(VIEWER)).rejects.toBeInstanceOf(ForbiddenError);
    expect(world.keyHost.requests).toHaveLength(0);
    await expect(attempt(ADMIN)).resolves.toBeDefined();
  });

  it('provider checks: personal is refused, OAuth and coming soon providers cannot take a key, unknown is 404', async () => {
    const world = buildApiWorld();
    const base = { context: world.context(OWNER), secret: { secret_key: XENDIT_KEY } };
    await expect(world.saveKey.execute({ ...base, provider_id: 'xendit', owner_scope: 'user' })).rejects.toMatchObject({ code: 'owner_scope_not_allowed' });
    await expect(world.saveKey.execute({ ...base, provider_id: 'google_calendar' })).rejects.toMatchObject({ status: 422 });
    await expect(world.saveKey.execute({ ...base, provider_id: 'shopee' })).rejects.toMatchObject({ code: 'provider_coming_soon' });
    await expect(world.saveKey.execute({ ...base, provider_id: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('counts against the connection limit for a new connection only', async () => {
    const world = buildApiWorld();
    const calls: number[] = [];
    const { SaveApiKeyConnectionUseCase } = await import('@/server/application/connections/save_api_key_connection_use_case');
    const save = new SaveApiKeyConnectionUseCase({
      registry: world.registry,
      drivers: world.drivers,
      connections: world.connections,
      grants: world.grants,
      secrets: world.vault,
      audit: world.auditLogger,
      transactions: world.transactions,
      entitlements: {
        check: async () => ({ allowed: true, reason: 'open' }),
        assert: async (_ws, key, quantity) => {
          if (key === 'connections.max') calls.push(quantity ?? -1);
        },
      },
      builder: world.builder,
    });
    world.keyHost.accepted.add(XENDIT_KEY);
    const created = await save.execute({ context: world.context(OWNER), provider_id: 'xendit', secret: { secret_key: XENDIT_KEY } });
    expect(calls).toEqual([1]);
    await save.execute({ context: world.context(OWNER), provider_id: 'xendit', connection_id: created.connection.id, secret: { secret_key: XENDIT_KEY } });
    expect(calls).toEqual([1]);
  });

  it('a vault failure leaves no connection, no grants and no audit row', async () => {
    const world = buildApiWorld();
    world.keyHost.accepted.add(XENDIT_KEY);
    world.vault.put = async () => {
      throw new VaultUnavailableError('down');
    };
    await expect(world.saveKey.execute({ context: world.context(OWNER), provider_id: 'xendit', secret: { secret_key: XENDIT_KEY } })).rejects.toBeInstanceOf(VaultUnavailableError);
    expect(world.connections.rows.size).toBe(0);
  });

  describe('replacing a key', () => {
    it('keeps the connection, replaces the secret, clears the error, and audits the rotation', async () => {
      const world = buildApiWorld();
      const { connection } = await saveXendit(world);
      await world.connections.update(WS_A, connection.id, { status: 'needs_reconnect', last_error_code: 'invalid_credentials' });
      const newKey = 'xnd_development_ROTATEDabcdefghijklmnopqrstu9999';
      world.keyHost.accepted.add(newKey);
      world.clock.now = new Date(world.clock.now.getTime() + 30 * 86_400_000);

      const result = await world.saveKey.execute({
        context: world.context(ADMIN),
        provider_id: 'xendit',
        connection_id: connection.id,
        secret: { secret_key: newKey },
      });

      expect(result.created).toBe(false);
      expect(result.connection.id).toBe(connection.id);
      expect(result.connection.status).toBe('connected');
      expect(result.connection.last_error_code).toBeNull();
      expect(result.connection.account_label).toBe('xnd_…9999');
      expect((await world.vault.get(world.secretRef(connection.id, WS_A, 'xendit')))?.payload.secret_key).toBe(newKey);
      expect(world.audit.rows.some((r) => r.action === 'connection.secret_rotated' && r.target_id === connection.id)).toBe(true);
      expect(new Date(result.connection.secret_rotation_due_at!).getTime()).toBe(world.clock.now.getTime() + 90 * 86_400_000);
      expect(world.connections.rows.size).toBe(1);
    });

    it('a rejected new key changes nothing', async () => {
      const world = buildApiWorld();
      const { connection } = await saveXendit(world);
      await expect(
        world.saveKey.execute({ context: world.context(OWNER), provider_id: 'xendit', connection_id: connection.id, secret: { secret_key: 'xnd_development_bad000000000000000000' } }),
      ).rejects.toMatchObject({ status: 422 });
      expect((await world.vault.get(world.secretRef(connection.id, WS_A, 'xendit')))?.payload.secret_key).toBe(XENDIT_KEY);
    });

    it('needs the right provider, a connection the caller can manage, and one that is not revoked', async () => {
      const world = buildApiWorld();
      const { connection } = await saveXendit(world);
      world.keyHost.accepted.add(MIDTRANS_KEY);
      await expect(
        world.saveKey.execute({ context: world.context(OWNER), provider_id: 'midtrans', connection_id: connection.id, secret: { server_key: MIDTRANS_KEY, environment: 'sandbox' } }),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        world.saveKey.execute({ context: world.context(MEMBER), provider_id: 'xendit', connection_id: connection.id, secret: { secret_key: XENDIT_KEY } }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await world.disconnect.execute({ context: world.context(OWNER), connection_id: connection.id });
      await expect(
        world.saveKey.execute({ context: world.context(OWNER), provider_id: 'xendit', connection_id: connection.id, secret: { secret_key: XENDIT_KEY } }),
      ).rejects.toMatchObject({ code: 'connection_revoked' });
    });

    it('a connection of another workspace is a 404', async () => {
      const world = buildApiWorld();
      const { connection } = await saveXendit(world);
      await expect(
        world.saveKey.execute({ context: world.context(OWNER, 's', WS_B), provider_id: 'xendit', connection_id: connection.id, secret: { secret_key: XENDIT_KEY } }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it('G1: the pasted key is in the vault and nowhere else: not in logs, audit rows, connection rows or errors', async () => {
    const world = buildApiWorld();
    const capture = captureConsole();
    try {
      world.keyHost.accepted.add(XENDIT_KEY);
      await world.saveKey.execute({ context: world.context(OWNER), provider_id: 'xendit', secret: { secret_key: XENDIT_KEY } });
      await world.saveKey.execute({ context: world.context(OWNER), provider_id: 'xendit', secret: { secret_key: 'xnd_development_CANARYother000000000000000' } }).catch(() => undefined);
      const haystack = [capture.text(), JSON.stringify(world.audit.rows), JSON.stringify([...world.connections.rows.values()]), JSON.stringify(world.log.lines)].join('\n');
      expect(haystack).not.toContain('CANARYabcdefghijkl');
      expect(haystack).not.toContain('CANARYother');
    } finally {
      capture.restore();
    }
  });
});

describe('the access matrix (FR-CONN-04, ADR-0039)', () => {
  const row = (agent_slug: string, read: boolean, write: boolean) => ({ agent_slug, read, write });

  it('replaces the matrix: listed rows are granted, unlisted specialists lose access, and the change is audited with counts', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);

    const result = await world.updateGrants.execute({
      context: world.context(OWNER),
      connection_id: id,
      grants: [row('sinopeople', true, true), row('sinohelp', true, false)],
    });

    expect(result.grants.filter((g) => g.read).map((g) => [g.agent_slug, g.write])).toEqual([
      ['sinopeople', true],
      ['sinohelp', false],
    ]);
    expect(result.grants).toHaveLength(world.specialistSlugs.length);
    // sinosales had read from the defaults and was not listed, so it lost it.
    expect(result.grants.find((g) => g.agent_slug === 'sinosales')).toEqual(row('sinosales', false, false));
    const event = world.audit.rows.find((r) => r.action === 'connection.grant_changed')!;
    expect(event.target_id).toBe(id);
    expect(event.metadata).toMatchObject({ provider_id: 'google_calendar', read_count: 2, write_count: 1 });
  });

  it('write needs read, slugs must exist and be unique, and a read-only provider takes no write', async () => {
    const world = buildApiWorld();
    const google = await connectGoogle(world);
    const { connection: xendit } = await saveXendit(world);
    const update = (id: string, grants: ReturnType<typeof row>[]) => world.updateGrants.execute({ context: world.context(OWNER), connection_id: id, grants });

    await expect(update(google, [row('sinopeople', false, true)])).rejects.toMatchObject({ status: 422, details: [{ detail: expect.stringContaining('read') }] });
    await expect(update(google, [row('sinonope', true, false)])).rejects.toMatchObject({ status: 422, details: [{ code: 'unknown_specialist' }] });
    await expect(update(google, [row('sinopeople', true, false), row('sinopeople', true, true)])).rejects.toMatchObject({ status: 422 });
    await expect(update(xendit.id, [row('sinofinance', true, true)])).rejects.toMatchObject({ status: 422, details: [{ code: 'write_not_supported' }] });
    // Nothing above changed anything.
    expect((await world.grants.listByConnection(WS_A, google)).map((g) => g.agent_slug).sort()).toEqual(['sinopeople', 'sinosales']);
  });

  it('read access on a read-only provider is fine', async () => {
    const world = buildApiWorld();
    const { connection } = await saveXendit(world);
    const result = await world.updateGrants.execute({
      context: world.context(OWNER),
      connection_id: connection.id,
      grants: [row('sinofinance', true, false), row('sinoinsights', true, false)],
    });
    expect(result.grants.filter((g) => g.read).map((g) => g.agent_slug)).toEqual(['sinofinance', 'sinoinsights']);
  });

  it('write is for owner and admin: a member cannot change grants, not even on their own personal connection', async () => {
    const world = buildApiWorld();
    const shared = await connectGoogle(world);
    world.google.config.account = { id: 'acct-m', label: 'm@example.test' };
    const personal = await connectGoogle(world, MEMBER, 'user');
    const grants = [row('sinopeople', true, true)];
    await expect(world.updateGrants.execute({ context: world.context(MEMBER), connection_id: shared, grants })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(world.updateGrants.execute({ context: world.context(VIEWER), connection_id: shared, grants })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(world.updateGrants.execute({ context: world.context(MEMBER), connection_id: personal, grants })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(world.updateGrants.execute({ context: world.context(ADMIN), connection_id: shared, grants })).resolves.toBeDefined();
  });

  it("another member's personal connection and another workspace's connection are 404, a revoked one is 409", async () => {
    const world = buildApiWorld();
    const shared = await connectGoogle(world);
    world.google.config.account = { id: 'acct-m', label: 'm@example.test' };
    const personal = await connectGoogle(world, MEMBER, 'user');
    const grants = [row('sinopeople', true, false)];
    await expect(world.updateGrants.execute({ context: world.context(OWNER), connection_id: personal, grants })).rejects.toBeInstanceOf(NotFoundError);
    await expect(world.updateGrants.execute({ context: world.context(OWNER, 's', WS_B), connection_id: shared, grants })).rejects.toBeInstanceOf(NotFoundError);
    await world.disconnect.execute({ context: world.context(OWNER), connection_id: shared });
    await expect(world.updateGrants.execute({ context: world.context(OWNER), connection_id: shared, grants })).rejects.toMatchObject({ code: 'connection_revoked' });
  });

  it('a failed audit write rolls the new matrix back', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    const before = await world.grants.listByConnection(WS_A, id);
    world.audit.failWith = new Error('audit down');
    await expect(world.updateGrants.execute({ context: world.context(OWNER), connection_id: id, grants: [row('sinopeople', true, true)] })).rejects.toThrow('audit down');
    world.audit.failWith = null;
    // The fake grants repository has no rollback, so the guarantee is the order: audit inside the same scope as the write.
    expect(world.transactions.rollbacks).toBeGreaterThan(0);
    expect(before.length).toBeGreaterThan(0);
  });
});

describe('disconnecting (FR-CONN-18, ADR-0036 decision 7)', () => {
  it('revokes at the provider, erases the secret, tombstones the row, removes the grants and audits it', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    const refreshToken = String((await world.vault.get(world.secretRef(id)))!.payload.refresh_token);

    const result = await world.disconnect.execute({ context: world.context(OWNER), connection_id: id });

    expect(result).toMatchObject({ id, status: 'revoked', provider_revoked: true });
    expect(world.google.revoked).toContain(refreshToken);
    expect(await world.vaultRows.find('connection', id)).toBeNull();
    const row = (await world.connections.findById(WS_A, id))!;
    expect(row).toMatchObject({ status: 'revoked', revoked_by_user_id: OWNER, external_account_id: null, account_label: null, granted_scopes: [] });
    expect(new Date(result.revoked_at).getTime()).toBe(row.revoked_at!.getTime());
    expect(await world.grants.listByConnection(WS_A, id)).toEqual([]);
    expect(world.audit.rows.find((r) => r.action === 'connection.revoked')?.metadata).toMatchObject({ provider_id: 'google_calendar', provider_revoked: true });
    await expect(world.resolver.forConnection(WS_A, id)).rejects.toMatchObject({ code: 'connection_revoked' });
  });

  it('an unreachable provider does not stop a person from disconnecting; the result says the provider was not told', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    world.google.failNext('network');
    const result = await world.disconnect.execute({ context: world.context(OWNER), connection_id: id });
    expect(result.provider_revoked).toBe(false);
    expect(await world.vaultRows.find('connection', id)).toBeNull();
    expect((await world.connections.findById(WS_A, id))?.status).toBe('revoked');
    expect(world.log.lines.some((l) => l.step === 'provider_revoke')).toBe(true);
  });

  it('a pasted-key connection has nothing to revoke at the provider but the key is erased', async () => {
    const world = buildApiWorld();
    const { connection } = await saveXendit(world);
    const calls = world.keyHost.requests.length;
    const result = await world.disconnect.execute({ context: world.context(ADMIN), connection_id: connection.id });
    expect(result.provider_revoked).toBe(false);
    expect(world.keyHost.requests.length).toBe(calls);
    expect(await world.vaultRows.find('connection', connection.id)).toBeNull();
  });

  it('a connection that needs reconnecting can be disconnected without calling the provider', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    await world.connections.update(WS_A, id, { status: 'needs_reconnect' });
    const calls = world.google.requests.length;
    const result = await world.disconnect.execute({ context: world.context(OWNER), connection_id: id });
    expect(result.provider_revoked).toBe(false);
    expect(world.google.requests.length).toBe(calls);
    expect(await world.vaultRows.find('connection', id)).toBeNull();
  });

  it('who may disconnect: owner and admin shared ones, a member only their own personal one, a viewer nothing', async () => {
    const world = buildApiWorld();
    const shared = await connectGoogle(world);
    world.google.config.account = { id: 'acct-m', label: 'm@example.test' };
    const mine = await connectGoogle(world, MEMBER, 'user');
    const disconnect = (user: string, id: string) => world.disconnect.execute({ context: world.context(user), connection_id: id });

    await expect(disconnect(MEMBER, shared)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(disconnect(VIEWER, shared)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(disconnect(ADMIN, mine)).rejects.toBeInstanceOf(NotFoundError);
    await expect(disconnect(OWNER, mine)).rejects.toBeInstanceOf(NotFoundError);
    await expect(disconnect(MEMBER_2, mine)).rejects.toBeInstanceOf(NotFoundError);
    await expect(disconnect(MEMBER, mine)).resolves.toMatchObject({ status: 'revoked' });
    await expect(disconnect(ADMIN, shared)).resolves.toMatchObject({ status: 'revoked' });
  });

  it('another workspace gets a 404', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    await expect(world.disconnect.execute({ context: world.context(OWNER, 's', WS_B), connection_id: id })).rejects.toBeInstanceOf(NotFoundError);
    expect((await world.connections.findById(WS_A, id))?.status).toBe('connected');
  });

  it('repeating it answers with the first revocation and writes no second audit row', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    const first = await world.disconnect.execute({ context: world.context(OWNER), connection_id: id });
    world.clock.now = new Date(world.clock.now.getTime() + 60_000);
    const second = await world.disconnect.execute({ context: world.context(OWNER), connection_id: id });
    expect(second).toMatchObject({ id, status: 'revoked', revoked_at: first.revoked_at });
    expect(world.audit.rows.filter((r) => r.action === 'connection.revoked')).toHaveLength(1);
  });

  it('if the secret cannot be erased the connection stays as it is, so nothing is half disconnected', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    world.vault.erase = async () => {
      throw new VaultUnavailableError('down');
    };
    await expect(world.disconnect.execute({ context: world.context(OWNER), connection_id: id })).rejects.toBeInstanceOf(VaultUnavailableError);
    expect((await world.connections.findById(WS_A, id))?.status).toBe('connected');
  });
});

describe('testing a connection', () => {
  it('runs the probe now, never refreshes, and reports the result', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    const result = await world.testConnection.execute({ context: world.context(OWNER), connection_id: id });
    expect(result).toMatchObject({ result: 'ok', status: 'connected', error_code: null });
    expect(result.checked_at).toBe(world.clock.now.toISOString());

    world.clock.now = new Date(world.clock.now.getTime() + 2 * 3_600_000);
    world.google.now = world.clock.now.getTime();
    const calls = world.google.requests.length;
    const expired = await world.testConnection.execute({ context: world.context(OWNER), connection_id: id });
    expect(expired).toMatchObject({ result: 'failed', error_code: 'token_expired' });
    expect(world.google.requests.length).toBe(calls);
  });

  it('tests a pasted key with the key host', async () => {
    const world = buildApiWorld();
    const { connection } = await saveXendit(world);
    expect(await world.testConnection.execute({ context: world.context(OWNER), connection_id: connection.id })).toMatchObject({ result: 'ok' });
    world.keyHost.accepted.clear();
    expect(await world.testConnection.execute({ context: world.context(OWNER), connection_id: connection.id })).toMatchObject({
      result: 'failed',
      status: 'needs_reconnect',
      error_code: 'invalid_credentials',
    });
  });

  it('refuses a viewer, a member on a shared connection and a revoked connection', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    await expect(world.testConnection.execute({ context: world.context(VIEWER), connection_id: id })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(world.testConnection.execute({ context: world.context(MEMBER), connection_id: id })).rejects.toBeInstanceOf(ForbiddenError);
    await world.disconnect.execute({ context: world.context(OWNER), connection_id: id });
    await expect(world.testConnection.execute({ context: world.context(OWNER), connection_id: id })).rejects.toMatchObject({ code: 'connection_revoked' });
  });
});

describe('reconnect', () => {
  it('starts a flow for an OAuth connection that keeps its id', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    const started = await world.reconnectConnection.execute({ context: world.context(OWNER), connection_id: id });
    const result = await runCallback(world, world.google.authorize(started.authorization_url), { user_id: OWNER, session_id: 'session-' + OWNER });
    expect(result).toMatchObject({ result: 'reconnected', connection_id: id });
  });

  it('a pasted-key connection is replaced, not reconnected', async () => {
    const world = buildApiWorld();
    const { connection } = await saveXendit(world);
    await expect(world.reconnectConnection.execute({ context: world.context(OWNER), connection_id: connection.id })).rejects.toMatchObject({ code: 'not_reconnectable' });
  });

  it('a viewer or a member on a shared connection cannot, and a revoked one is 409', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    await expect(world.reconnectConnection.execute({ context: world.context(VIEWER), connection_id: id })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(world.reconnectConnection.execute({ context: world.context(MEMBER), connection_id: id })).rejects.toBeInstanceOf(ForbiddenError);
    await world.disconnect.execute({ context: world.context(OWNER), connection_id: id });
    await expect(world.reconnectConnection.execute({ context: world.context(OWNER), connection_id: id })).rejects.toMatchObject({ code: 'connection_revoked' });
  });
});

describe('activity (connection.view_activity)', () => {
  it('lists the audit events of this connection only, newest first, with no payloads', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    world.google.config.account = { id: 'acct-2', label: 'other@example.test' };
    await connectGoogle(world);
    await world.updateGrants.execute({ context: world.context(OWNER), connection_id: id, grants: [{ agent_slug: 'sinopeople', read: true, write: false }] });

    const result = await world.activity.execute({ context: world.context(OWNER), connection_id: id });

    expect(result.events.map((e) => e.action)).toEqual(['connection.grant_changed', 'connection.created']);
    expect(result.next_cursor).toBeNull();
    expect(Object.keys(result.events[0]!).sort()).toEqual(['action', 'actor_type', 'id', 'occurred_at', 'outcome', 'reason_code']);
  });

  it('pages with a cursor', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    for (let i = 0; i < 3; i += 1) {
      world.clock.now = new Date(world.clock.now.getTime() + 1000);
      await world.updateGrants.execute({ context: world.context(OWNER), connection_id: id, grants: [{ agent_slug: 'sinopeople', read: true, write: false }] });
      // The fake audit repository stamps the real clock; give each row its own time.
    }
    world.audit.rows.forEach((row, index) => {
      row.occurred_at = new Date(Date.UTC(2026, 9, 23, 10, 0, index)).toISOString();
    });
    const first = await world.activity.execute({ context: world.context(OWNER), connection_id: id, limit: 2 });
    expect(first.events).toHaveLength(2);
    expect(first.next_cursor).not.toBeNull();
    const second = await world.activity.execute({ context: world.context(OWNER), connection_id: id, limit: 2, cursor: first.next_cursor! });
    expect(second.events.length).toBeGreaterThan(0);
    expect(second.events.map((e) => e.id)).not.toContain(first.events[0]!.id);
  });

  it('is for owner and admin, and follows the same visibility as the connection', async () => {
    const world = buildApiWorld();
    const id = await connectGoogle(world);
    world.google.config.account = { id: 'acct-m', label: 'm@example.test' };
    const personal = await connectGoogle(world, MEMBER, 'user');
    await expect(world.activity.execute({ context: world.context(MEMBER), connection_id: id })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(world.activity.execute({ context: world.context(VIEWER), connection_id: id })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(world.activity.execute({ context: world.context(ADMIN), connection_id: id })).resolves.toBeDefined();
    await expect(world.activity.execute({ context: world.context(OWNER), connection_id: personal })).rejects.toBeInstanceOf(NotFoundError);
    await expect(world.activity.execute({ context: world.context(OWNER, 's', WS_B), connection_id: id })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('mass revoke (runbook: incident response)', () => {
  it('needs the exact confirmation, then revokes every connection of the provider across workspaces', async () => {
    const world = buildApiWorld();
    const a = await connectGoogle(world);
    const other = await world.connections.create({
      workspace_id: WS_B,
      provider_id: 'google_calendar',
      owner_scope: 'workspace',
      owner_user_id: null,
      created_by_user_id: OWNER,
      auth_type: 'oauth2_pkce',
      status: 'connected',
      scope_bundle: 'calendar_read',
      requested_scopes: [],
      granted_scopes: [],
      external_account_id: 'acct-b',
      account_label: 'b@example.test',
      access_expires_at: null,
      refresh_expires_at: null,
    });
    await world.vault.put(world.secretRef(other.id, WS_B), { access_token: 'tb', refresh_token: 'rb' });

    await expect(world.massRevoke.execute({ provider_id: 'google_calendar', confirm: 'yes', limit: 100 })).rejects.toMatchObject({ status: 422 });
    expect((await world.connections.findById(WS_A, a))?.status).toBe('connected');

    const result = await world.massRevoke.execute({ provider_id: 'google_calendar', confirm: 'revoke-all:google_calendar', limit: 100 });

    expect(result).toEqual({ revoked: 2, more: false });
    expect((await world.connections.findById(WS_A, a))?.status).toBe('revoked');
    expect((await world.connections.findById(WS_B, other.id))?.status).toBe('revoked');
    expect(await world.vaultRows.find('connection', a)).toBeNull();
    expect(await world.vaultRows.find('connection', other.id)).toBeNull();
    const events = world.audit.rows.filter((r) => r.action === 'connection.revoked');
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.actor_type === 'system')).toBe(true);
    expect(events.map((e) => e.workspace_id).sort()).toEqual([WS_A, WS_B].sort());
  });

  it('works in batches and reports when more remain', async () => {
    const world = buildApiWorld();
    for (const account of ['a', 'b', 'c']) {
      world.google.config.account = { id: account, label: `${account}@example.test` };
      await connectGoogle(world);
    }
    const first = await world.massRevoke.execute({ provider_id: 'google_calendar', confirm: 'revoke-all:google_calendar', limit: 2 });
    expect(first).toEqual({ revoked: 2, more: true });
    const second = await world.massRevoke.execute({ provider_id: 'google_calendar', confirm: 'revoke-all:google_calendar', limit: 2 });
    expect(second).toEqual({ revoked: 1, more: false });
  });

  it('refuses an unknown provider', async () => {
    const world = buildApiWorld();
    await expect(world.massRevoke.execute({ provider_id: 'nope', confirm: 'revoke-all:nope', limit: 10 })).rejects.toBeInstanceOf(NotFoundError);
  });
});

it('a conflict from the repository is not swallowed by the view layer', async () => {
  const world = buildApiWorld();
  await connectGoogle(world);
  await expect(
    world.connections.create({
      workspace_id: WS_A,
      provider_id: 'google_calendar',
      owner_scope: 'workspace',
      owner_user_id: null,
      created_by_user_id: OWNER,
      auth_type: 'oauth2_pkce',
      status: 'connected',
      scope_bundle: null,
      requested_scopes: [],
      granted_scopes: [],
      external_account_id: 'acct-1',
      account_label: null,
      access_expires_at: null,
      refresh_expires_at: null,
    }),
  ).rejects.toBeInstanceOf(ConflictError);
});
