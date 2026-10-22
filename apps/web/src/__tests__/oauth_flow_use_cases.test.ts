import { afterEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '@/server/application/connections/oauth/oauth_support';
import { StartOAuthFlowUseCase } from '@/server/application/connections/oauth/start_oauth_flow_use_case';
import { ConnectorRegistry } from '@/server/application/connections/connector_registry';
import { PROVIDER_MANIFESTS } from '@/server/application/connections/manifests';
import { ForbiddenError, NotFoundError } from '@/server/domain/errors/domain_error';
import { VaultUnavailableError } from '@/server/domain/vault/vault';
import { allowAllEntitlements } from './fakes/allow_all_entitlements';
import { assertNoMarkers, captureConsole, type ConsoleCapture } from './helpers/canary_secrets';
import { ADMIN, MEMBER, MEMBER_2, OWNER, REDIRECT_URI, VIEWER, WS_A, WS_B, buildWorld, runCallback, type World } from './helpers/connections_world';

// WP-M2-14 (FR-CONN-06 to FR-CONN-14, FR-CONN-24, ADR-0037): the flow end to end
// against the fake provider. Each test names the rule it pins.

const CAL_READ = 'calendar_read';
const CAL_SCOPES = ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/calendar.readonly'];
const EVENTS = 'https://www.googleapis.com/auth/calendar.events';

async function connect(world: World, user = OWNER, input: Partial<Parameters<World['start']['execute']>[0]> = {}) {
  const started = await world.start.execute({
    context: world.context(user),
    provider_id: 'google_calendar',
    scope_bundle: CAL_READ,
    owner_scope: 'workspace',
    ...input,
  });
  const callbackUrl = world.google.authorize(started.authorization_url);
  return { started, callbackUrl };
}

describe('StartOAuthFlowUseCase', () => {
  it('creates a flow bound to the session and returns the provider URL for the chosen bundle only', async () => {
    const world = buildWorld();
    const { started } = await connect(world);
    const url = new URL(started.authorization_url);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('scope')).toBe(CAL_SCOPES.join(' '));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).not.toContain('calendar.events');

    const flow = world.flows.only();
    const state = url.searchParams.get('state')!;
    // Only the hash is stored (FR-CONN-06): the state itself is not in the row.
    expect(flow.state_hash).toBe(sha256Hex(state));
    expect(JSON.stringify(flow)).not.toContain(state);
    expect(flow.session_hash).toBe(sha256Hex('session-' + OWNER));
    expect(flow.user_id).toBe(OWNER);
    expect(flow.workspace_id).toBe(WS_A);
    expect(flow.redirect_uri).toBe(REDIRECT_URI);
    expect(flow.issuer).toBe('https://accounts.google.com');
    expect(flow.expires_at.getTime() - world.clock.now.getTime()).toBe(10 * 60_000);
    expect(flow.return_to).toBe('/w/acme/connections');
    expect(flow.scopes).toEqual(CAL_SCOPES);
    expect(started.flow_id).toBe(flow.id);
  });

  it('keeps the PKCE verifier in the vault, encrypted, and never in the flow row or the URL', async () => {
    const world = buildWorld();
    const { started } = await connect(world);
    const flow = world.flows.only();
    const row = await world.vaultRows.find('oauth_flow', flow.id);
    expect(row).not.toBeNull();
    const verifier = (await world.resolver.forOAuthFlow(flow)).verifier;
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(JSON.stringify(flow)).not.toContain(verifier);
    expect(started.authorization_url).not.toContain(verifier);
    expect(Buffer.concat([row!.ciphertext, row!.nonce]).toString('latin1')).not.toContain(verifier);
  });

  it('audits the start with ids only', async () => {
    const world = buildWorld();
    await connect(world);
    const event = world.audit.rows.find((row) => row.action === 'connection.oauth_started')!;
    expect(event.workspace_id).toBe(WS_A);
    expect(event.actor_id).toBe(OWNER);
    expect(event.metadata).toMatchObject({ provider_id: 'google_calendar', scope_bundle: CAL_READ, owner_scope: 'workspace' });
    expect(JSON.stringify(event)).not.toContain(world.flows.only().state_hash);
  });

  it('takes identity from the request context, never from input', async () => {
    const world = buildWorld();
    await world.start.execute({
      context: world.context(OWNER),
      provider_id: 'google_calendar',
      scope_bundle: CAL_READ,
      owner_scope: 'workspace',
      // Extra fields a caller might try to smuggle in are not part of the input type.
      ...({ user_id: MEMBER, workspace_id: WS_B } as object),
    });
    const flow = world.flows.only();
    expect(flow.user_id).toBe(OWNER);
    expect(flow.workspace_id).toBe(WS_A);
  });

  describe('entitlement (FR-BILL-34)', () => {
    it('checks connections.max with the next headcount for a new connection, and not for a reconnect', async () => {
      const world = buildWorld();
      const checks: Array<[string | null, string, number | undefined]> = [];
      const recording = {
        check: async () => ({ allowed: true, reason: 'open_mode' }),
        assert: async (workspaceId: string | null, key: string, quantity?: number) => {
          checks.push([workspaceId, key, quantity]);
        },
      };
      const start = new StartOAuthFlowUseCase({ ...world.startDeps, entitlements: recording });

      const first = await start.execute({ context: world.context(OWNER), provider_id: 'google_calendar', scope_bundle: CAL_READ, owner_scope: 'workspace' });
      expect(checks).toEqual([[WS_A, 'connections.max', 1]]);

      const callbackUrl = world.google.authorize(first.authorization_url);
      const connected = await runCallback(world, callbackUrl, { user_id: OWNER, session_id: 'session-' + OWNER });
      checks.length = 0;
      await start.execute({ context: world.context(OWNER), provider_id: 'google_calendar', scope_bundle: CAL_READ, owner_scope: 'workspace' });
      expect(checks).toEqual([[WS_A, 'connections.max', 2]]);

      checks.length = 0;
      await start.execute({ context: world.context(OWNER), provider_id: 'google_calendar', scope_bundle: CAL_READ, owner_scope: 'workspace', connection_id: connected.connection_id });
      expect(checks).toEqual([]);
    });

    it('a blocked entitlement stops the start before any flow exists', async () => {
      const world = buildWorld();
      const blocked = new StartOAuthFlowUseCase({
        ...world.startDeps,
        entitlements: {
          check: async () => ({ allowed: false, reason: 'limit' }),
          assert: async () => {
            throw new Error('entitlement_required');
          },
        },
      });
      await expect(
        blocked.execute({ context: world.context(OWNER), provider_id: 'google_calendar', scope_bundle: CAL_READ, owner_scope: 'workspace' }),
      ).rejects.toThrow('entitlement_required');
      expect(world.flows.flows.size).toBe(0);
    });
  });

  describe('permissions', () => {
    it('a viewer cannot connect anything', async () => {
      const world = buildWorld();
      await expect(connect(world, VIEWER)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(connect(world, VIEWER, { owner_scope: 'user' })).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('a member cannot create a workspace connection but can create a personal calendar', async () => {
      const world = buildWorld();
      await expect(connect(world, MEMBER)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(connect(world, MEMBER, { owner_scope: 'user' })).resolves.toBeDefined();
      expect(world.flows.only().owner_scope).toBe('user');
    });

    it('owner and admin can create workspace connections', async () => {
      const world = buildWorld();
      await expect(connect(world, ADMIN)).resolves.toBeDefined();
      await expect(connect(world, OWNER)).resolves.toBeDefined();
    });

    it('a personal connection is refused for a provider that is not personal capable', async () => {
      const world = buildWorld();
      await expect(
        world.start.execute({ context: world.context(MEMBER), provider_id: 'notion', scope_bundle: 'workspace_content', owner_scope: 'user' }),
      ).rejects.toMatchObject({ code: 'owner_scope_not_allowed', status: 422 });
    });

    it('a person who is not a member of the workspace is refused', async () => {
      const world = buildWorld();
      await expect(
        world.start.execute({
          context: { ...world.context(OWNER, 's', WS_B), workspace_id: WS_B, role: undefined },
          provider_id: 'google_calendar',
          scope_bundle: CAL_READ,
          owner_scope: 'workspace',
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('provider and input checks', () => {
    it('unknown provider is 404, coming soon and missing credentials are 409', async () => {
      const world = buildWorld();
      const base = { context: world.context(OWNER), scope_bundle: CAL_READ, owner_scope: 'workspace' as const };
      await expect(world.start.execute({ ...base, provider_id: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
      await expect(world.start.execute({ ...base, provider_id: 'mekari_jurnal' })).rejects.toMatchObject({ code: 'provider_coming_soon' });

      const noCredentials = new StartOAuthFlowUseCase({
        registry: new ConnectorRegistry(PROVIDER_MANIFESTS, { credentialsAvailable: () => false, specialistsFor: () => [] }),
        drivers: world.drivers,
        flows: world.flows,
        connections: world.connections,
        secrets: world.vault,
        workspaces: { findById: async () => ({ id: WS_A, workspace_slug: 'acme' }) as never },
        audit: { log: async () => {} },
        entitlements: allowAllEntitlements,
        redirectUri: REDIRECT_URI,
        clientIdFor: () => 'x',
      });
      await expect(noCredentials.execute({ ...base, provider_id: 'google_calendar' })).rejects.toMatchObject({
        code: 'provider_not_configured',
        status: 409,
      });
      expect(world.flows.flows.size).toBe(0);
    });

    it('an API-key provider cannot start an OAuth flow', async () => {
      const world = buildWorld();
      await expect(
        world.start.execute({ context: world.context(OWNER), provider_id: 'xendit', scope_bundle: 'read_only', owner_scope: 'workspace' }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('an unknown scope bundle is a validation error and creates no flow', async () => {
      const world = buildWorld();
      await expect(
        world.start.execute({ context: world.context(OWNER), provider_id: 'google_calendar', scope_bundle: 'everything', owner_scope: 'workspace' }),
      ).rejects.toMatchObject({ status: 422 });
      expect(world.flows.flows.size).toBe(0);
    });

    it.each(['https://evil.example/w/acme', '//evil.example', '/admin', '/w/acme\\evil', '/w/../evil'])(
      'refuses the return_to %s (open redirect)',
      async (returnTo) => {
        const world = buildWorld();
        await expect(connect(world, OWNER, { return_to: returnTo })).rejects.toMatchObject({ status: 422 });
        expect(world.flows.flows.size).toBe(0);
      },
    );

    it('accepts a relative return_to under /w/', async () => {
      const world = buildWorld();
      await connect(world, OWNER, { return_to: '/w/acme/settings/connections' });
      expect(world.flows.only().return_to).toBe('/w/acme/settings/connections');
    });

    it('removes the flow when the vault cannot store the verifier, and sends nobody anywhere', async () => {
      const world = buildWorld();
      const broken = new StartOAuthFlowUseCase({
        registry: world.registry,
        drivers: world.drivers,
        flows: world.flows,
        connections: world.connections,
        secrets: {
          put: async () => {
            throw new VaultUnavailableError('no key');
          },
          erase: async () => {},
        },
        workspaces: { findById: async () => ({ id: WS_A, workspace_slug: 'acme' }) as never },
        audit: { log: async () => {} },
        entitlements: allowAllEntitlements,
        redirectUri: REDIRECT_URI,
        clientIdFor: () => 'client-id',
      });
      await expect(
        broken.execute({ context: world.context(OWNER), provider_id: 'google_calendar', scope_bundle: CAL_READ, owner_scope: 'workspace' }),
      ).rejects.toBeInstanceOf(VaultUnavailableError);
      expect(world.flows.flows.size).toBe(0);
    });
  });

  describe('reconnect and incremental consent', () => {
    async function connected(world: World) {
      const { callbackUrl } = await connect(world);
      const result = await runCallback(world, callbackUrl, { user_id: OWNER, session_id: 'session-' + OWNER });
      return result.connection_id!;
    }

    it('starts a flow that carries the connection id', async () => {
      const world = buildWorld();
      const id = await connected(world);
      await world.start.execute({
        context: world.context(OWNER),
        provider_id: 'google_calendar',
        scope_bundle: CAL_READ,
        owner_scope: 'workspace',
        connection_id: id,
      });
      const flows = [...world.flows.flows.values()];
      expect(flows.at(-1)?.connection_id).toBe(id);
    });

    it('a revoked connection cannot be reconnected', async () => {
      const world = buildWorld();
      const id = await connected(world);
      await world.connections.tombstone(WS_A, id, { by_user_id: OWNER, at: new Date() });
      await expect(
        world.start.execute({ context: world.context(OWNER), provider_id: 'google_calendar', scope_bundle: CAL_READ, owner_scope: 'workspace', connection_id: id }),
      ).rejects.toMatchObject({ code: 'connection_revoked' });
    });

    it("another member's personal connection is not found, even for an admin", async () => {
      const world = buildWorld();
      const { callbackUrl } = await connect(world, MEMBER, { owner_scope: 'user' });
      const personal = (await runCallback(world, callbackUrl, { user_id: MEMBER, session_id: 'session-' + MEMBER })).connection_id!;
      await expect(
        world.start.execute({ context: world.context(ADMIN), provider_id: 'google_calendar', scope_bundle: CAL_READ, owner_scope: 'user', connection_id: personal }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('a member cannot reconnect a workspace connection', async () => {
      const world = buildWorld();
      const id = await connected(world);
      await expect(
        world.start.execute({ context: world.context(MEMBER), provider_id: 'google_calendar', scope_bundle: CAL_READ, owner_scope: 'user', connection_id: id }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('a reconnect must name the same provider', async () => {
      const world = buildWorld();
      const id = await connected(world);
      await expect(
        world.start.execute({ context: world.context(OWNER), provider_id: 'notion', scope_bundle: 'workspace_content', owner_scope: 'workspace', connection_id: id }),
      ).rejects.toMatchObject({ status: 422 });
    });
  });
});

describe('HandleOAuthCallbackUseCase', () => {
  let capture: ConsoleCapture | null = null;
  afterEach(() => capture?.restore());

  const owner = { user_id: OWNER, session_id: 'session-' + OWNER };

  it('connects: stores tokens in the vault, creates the connection, grants read to the declaring specialists, redirects calmly', async () => {
    const world = buildWorld();
    const { callbackUrl } = await connect(world);

    const result = await runCallback(world, callbackUrl, owner);

    expect(result.result).toBe('connected');
    expect(result.redirect_to).toBe(`/w/acme/connections?connection_result=connected&provider_id=google_calendar&connection_id=${result.connection_id}`);
    const connection = (await world.connections.findById(WS_A, result.connection_id!))!;
    expect(connection).toMatchObject({
      provider_id: 'google_calendar',
      owner_scope: 'workspace',
      owner_user_id: null,
      status: 'connected',
      auth_type: 'oauth2_pkce',
      scope_bundle: CAL_READ,
      external_account_id: 'acct-1',
      account_label: 'budi@example.test',
      created_by_user_id: OWNER,
    });
    expect(connection.granted_scopes).toEqual(CAL_SCOPES);
    expect(connection.access_expires_at?.getTime()).toBe(world.clock.now.getTime() + 3600_000);

    // Tokens are in the vault, readable only through the resolver.
    const resolved = await world.resolver.forConnection(WS_A, connection.id);
    expect(resolved.credentials.access_token).toMatch(/^at-/);
    expect(resolved.credentials.refresh_token).toMatch(/^rt-/);

    // Read to the specialists whose skills declare the provider, never write.
    const grants = await world.grants.listByConnection(WS_A, connection.id);
    expect(grants.map((grant) => grant.agent_slug).sort()).toEqual(['sinopeople', 'sinosales']);
    expect(grants.every((grant) => grant.access_level === 'read')).toBe(true);

    // The flow was consumed and its verifier erased.
    expect(world.flows.only().consumed_at).not.toBeNull();
    expect(await world.vaultRows.find('oauth_flow', world.flows.only().id)).toBeNull();

    const created = world.audit.rows.find((row) => row.action === 'connection.created')!;
    expect(created.target_id).toBe(connection.id);
    expect(created.metadata).toMatchObject({ provider_id: 'google_calendar', granted_scope_count: 3 });
    expect(world.audit.rows.some((row) => row.action === 'connection.scope_downgraded')).toBe(false);
  });

  it('G5: a state works once; the replay finds nothing and changes nothing', async () => {
    const world = buildWorld();
    const { callbackUrl } = await connect(world);
    await runCallback(world, callbackUrl, owner);
    const exchangesBefore = world.google.requests.length;

    const replay = await runCallback(world, callbackUrl, owner);

    expect(replay.result).toBe('expired');
    expect(replay.redirect_to).toBe('/?connection_result=expired');
    expect(world.connections.rows.size).toBe(1);
    expect(world.google.requests.length).toBe(exchangesBefore);
  });

  it('G5: an expired flow is refused before any token request', async () => {
    const world = buildWorld();
    const { callbackUrl } = await connect(world);
    world.clock.now = new Date(world.clock.now.getTime() + 10 * 60_000 + 1);

    const result = await runCallback(world, callbackUrl, owner);

    expect(result.result).toBe('expired');
    expect(world.google.requests).toHaveLength(0);
    expect(world.connections.rows.size).toBe(0);
    expect(await world.vaultRows.find('oauth_flow', world.flows.only().id)).toBeNull();
  });

  it('G5: another user on the callback gets nothing, and the flow is burned', async () => {
    const world = buildWorld();
    const { callbackUrl } = await connect(world);

    const result = await runCallback(world, callbackUrl, { user_id: ADMIN, session_id: 'session-' + ADMIN });

    expect(result.result).toBe('error');
    expect(result.redirect_to).toBe('/?connection_result=error');
    expect(world.connections.rows.size).toBe(0);
    expect(world.google.requests).toHaveLength(0);
    // Burned: the real owner cannot reuse the stolen state either.
    expect((await runCallback(world, callbackUrl, owner)).result).toBe('expired');
  });

  it('G5: the same user in a different browser session is refused (session binding)', async () => {
    const world = buildWorld();
    const { callbackUrl } = await connect(world);
    const result = await runCallback(world, callbackUrl, { user_id: OWNER, session_id: 'another-session' });
    expect(result.result).toBe('error');
    expect(world.connections.rows.size).toBe(0);
  });

  it('G5: no session at all is refused', async () => {
    const world = buildWorld();
    const { callbackUrl } = await connect(world);
    const result = await runCallback(world, callbackUrl, { user_id: null, session_id: null });
    expect(result.result).toBe('error');
    expect(world.connections.rows.size).toBe(0);
  });

  it('G5: a mismatched iss is refused before the code is redeemed (RFC 9207)', async () => {
    const world = buildWorld();
    const { started } = await connect(world);
    const callbackUrl = world.google.authorize(started.authorization_url, { iss: 'https://evil.example' });
    const before = world.google.requests.length;

    const result = await runCallback(world, callbackUrl, owner);

    expect(result.result).toBe('error');
    expect(world.google.requests.length).toBe(before);
    expect(world.connections.rows.size).toBe(0);
  });

  it('a callback without iss is accepted (providers that do not send it)', async () => {
    const world = buildWorld();
    const { started } = await connect(world);
    const callbackUrl = world.google.authorize(started.authorization_url, { iss: null });
    expect((await runCallback(world, callbackUrl, owner)).result).toBe('connected');
  });

  it('a verifier that does not match the challenge cannot redeem the code (PKCE)', async () => {
    const world = buildWorld();
    const { callbackUrl } = await connect(world);
    // Replace the stored verifier with another value, as a bug or an attacker with the code would.
    const flow = world.flows.only();
    await world.vault.put({ owner_type: 'oauth_flow', owner_id: flow.id, workspace_id: WS_A, provider_id: 'google_calendar' }, { code_verifier: 'wrong-verifier-wrong-verifier-wrong-verifier-123' });
    const result = await runCallback(world, callbackUrl, owner);
    expect(result.result).toBe('error');
    expect(world.connections.rows.size).toBe(0);
  });

  it('a person who declines at the provider gets the calm denied result, and the verifier is erased', async () => {
    const world = buildWorld();
    const { started } = await connect(world);
    const callbackUrl = world.google.authorize(started.authorization_url, { deny: true });

    const result = await runCallback(world, callbackUrl, owner);

    expect(result.result).toBe('denied');
    expect(result.redirect_to).toBe('/w/acme/connections?connection_result=denied');
    expect(world.google.requests).toHaveLength(0);
    expect(await world.vaultRows.find('oauth_flow', world.flows.only().id)).toBeNull();
  });

  it('a callback without code or without state is an error or expired, with no token request', async () => {
    const world = buildWorld();
    const { started } = await connect(world);
    const state = new URL(started.authorization_url).searchParams.get('state')!;
    const noCode = await world.callback.execute({ query: { state }, session: owner, request_id: 'r' });
    expect(noCode.result).toBe('error');
    const noState = await world.callback.execute({ query: { code: 'abc' }, session: owner, request_id: 'r' });
    expect(noState.result).toBe('expired');
    expect(world.google.requests).toHaveLength(0);
  });

  it('refuses a person whose role no longer allows connecting', async () => {
    const world = buildWorld();
    const { callbackUrl } = await connect(world, ADMIN);
    world.roles.set(`${WS_A}:${ADMIN}`, 'viewer');
    const result = await runCallback(world, callbackUrl, { user_id: ADMIN, session_id: 'session-' + ADMIN });
    expect(result.result).toBe('error');
    expect(world.connections.rows.size).toBe(0);
    world.roles.delete(`${WS_A}:${ADMIN}`);
  });

  it('a person removed from the workspace is refused', async () => {
    const world = buildWorld();
    const { callbackUrl } = await connect(world, ADMIN);
    world.roles.delete(`${WS_A}:${ADMIN}`);
    const result = await runCallback(world, callbackUrl, { user_id: ADMIN, session_id: 'session-' + ADMIN });
    expect(result.result).toBe('error');
  });

  it('FR-CONN-13: unticked scopes make the connection partial and are audited', async () => {
    const world = buildWorld({ google: { grant_only: ['openid', 'https://www.googleapis.com/auth/userinfo.email'] } });
    const { callbackUrl } = await connect(world);

    const result = await runCallback(world, callbackUrl, owner);

    expect(result.result).toBe('partial');
    const connection = (await world.connections.findById(WS_A, result.connection_id!))!;
    expect(connection.status).toBe('partial');
    expect(connection.granted_scopes).toEqual(['openid', 'https://www.googleapis.com/auth/userinfo.email']);
    expect(connection.requested_scopes).toEqual(CAL_SCOPES);
    const downgraded = world.audit.rows.find((row) => row.action === 'connection.scope_downgraded')!;
    expect(downgraded.metadata).toMatchObject({ missing_scope_count: 1 });
  });

  it('never accepts scopes beyond the chosen bundle', async () => {
    const world = buildWorld({ google: { extra_scopes: [EVENTS] } });
    const { callbackUrl } = await connect(world);
    const result = await runCallback(world, callbackUrl, owner);
    const connection = (await world.connections.findById(WS_A, result.connection_id!))!;
    expect(connection.granted_scopes).not.toContain(EVENTS);
    expect(connection.granted_scopes).toEqual(CAL_SCOPES);
  });

  it('FR-CONN-13: the same account twice is a duplicate; the new tokens are revoked and not stored', async () => {
    const world = buildWorld();
    const first = await runCallback(world, (await connect(world)).callbackUrl, owner);
    const { callbackUrl } = await connect(world);

    const second = await runCallback(world, callbackUrl, owner);

    expect(second.result).toBe('duplicate_account');
    expect(second.connection_id).toBe(first.connection_id);
    expect(second.redirect_to).toContain('connection_result=duplicate_account');
    expect(world.connections.rows.size).toBe(1);
    expect(world.google.revoked.length).toBeGreaterThan(0);
    // Exactly one secret row for the one connection.
    expect([...world.vaultRows.rows.keys()].filter((key) => key.startsWith('connection:'))).toHaveLength(1);
  });

  it('the same account connected personally by two people is two connections', async () => {
    const world = buildWorld();
    const a = await runCallback(world, (await connect(world, MEMBER, { owner_scope: 'user' })).callbackUrl, { user_id: MEMBER, session_id: 'session-' + MEMBER });
    const b = await runCallback(world, (await connect(world, MEMBER_2, { owner_scope: 'user' })).callbackUrl, { user_id: MEMBER_2, session_id: 'session-' + MEMBER_2 });
    expect(a.result).toBe('connected');
    expect(b.result).toBe('connected');
    expect(world.connections.rows.size).toBe(2);
  });

  it('a personal connection belongs to its owner and is invisible to the other member', async () => {
    const world = buildWorld();
    const { callbackUrl } = await connect(world, MEMBER, { owner_scope: 'user' });
    const result = await runCallback(world, callbackUrl, { user_id: MEMBER, session_id: 'session-' + MEMBER });
    const connection = (await world.connections.findById(WS_A, result.connection_id!))!;
    expect(connection.owner_scope).toBe('user');
    expect(connection.owner_user_id).toBe(MEMBER);
    expect(await world.connections.findVisible(WS_A, connection.id, MEMBER)).not.toBeNull();
    expect(await world.connections.findVisible(WS_A, connection.id, MEMBER_2)).toBeNull();
    expect(await world.connections.findVisible(WS_A, connection.id, ADMIN)).toBeNull();
  });

  describe('reconnect (FR-CONN-24)', () => {
    it('keeps the connection id and the grants, replaces the secret and clears the error', async () => {
      const world = buildWorld({ google: { rotate_refresh: true } });
      const first = await runCallback(world, (await connect(world)).callbackUrl, owner);
      const id = first.connection_id!;
      await world.grants.replaceAll(WS_A, id, [{ agent_slug: 'sinofinance', access_level: 'write' }], OWNER);
      await world.connections.update(WS_A, id, { status: 'needs_reconnect', last_error_code: 'invalid_grant' });
      const oldSecret = await world.vault.get(world.secretRef(id));

      const { callbackUrl } = await connect(world, OWNER, { connection_id: id });
      const result = await runCallback(world, callbackUrl, owner);

      expect(result.result).toBe('reconnected');
      expect(result.connection_id).toBe(id);
      expect(world.connections.rows.size).toBe(1);
      const connection = (await world.connections.findById(WS_A, id))!;
      expect(connection.status).toBe('connected');
      expect(connection.last_error_code).toBeNull();
      expect(await world.grants.listByConnection(WS_A, id)).toEqual([
        { connection_id: id, agent_slug: 'sinofinance', access_level: 'write', approval_policy: 'ask_every_time' },
      ]);
      const newSecret = await world.vault.get(world.secretRef(id));
      expect(newSecret?.payload.access_token).not.toBe(oldSecret?.payload.access_token);
      expect(world.audit.rows.some((row) => row.action === 'connection.reconnected' && row.target_id === id)).toBe(true);
    });

    it('a different account is refused and nothing changes (FR-CONN-24)', async () => {
      const world = buildWorld();
      const first = await runCallback(world, (await connect(world)).callbackUrl, owner);
      const id = first.connection_id!;
      await world.connections.update(WS_A, id, { status: 'needs_reconnect' });
      const secretBefore = await world.vault.get(world.secretRef(id));
      world.google.config.account = { id: 'acct-OTHER', label: 'someone@else.test' };

      const { callbackUrl } = await connect(world, OWNER, { connection_id: id });
      const result = await runCallback(world, callbackUrl, owner);

      expect(result.result).toBe('different_account');
      const connection = (await world.connections.findById(WS_A, id))!;
      expect(connection.status).toBe('needs_reconnect');
      expect(connection.external_account_id).toBe('acct-1');
      expect((await world.vault.get(world.secretRef(id)))?.payload).toEqual(secretBefore?.payload);
      expect(world.google.revoked.length).toBeGreaterThan(0);
    });

    it('incremental consent widens the granted scopes and the bundle, without granting write to anyone', async () => {
      const world = buildWorld();
      const first = await runCallback(world, (await connect(world)).callbackUrl, owner);
      const id = first.connection_id!;
      const grantsBefore = await world.grants.listByConnection(WS_A, id);

      const { callbackUrl } = await connect(world, OWNER, { connection_id: id, scope_bundle: 'calendar_events' });
      const result = await runCallback(world, callbackUrl, owner);

      expect(result.result).toBe('reconnected');
      const connection = (await world.connections.findById(WS_A, id))!;
      expect(connection.scope_bundle).toBe('calendar_events');
      expect(connection.granted_scopes).toContain(EVENTS);
      expect(await world.grants.listByConnection(WS_A, id)).toEqual(grantsBefore);
    });

    it('keeps the old refresh token when the provider does not send a new one on a healthy connection', async () => {
      const world = buildWorld();
      const first = await runCallback(world, (await connect(world)).callbackUrl, owner);
      const id = first.connection_id!;
      const before = (await world.vault.get(world.secretRef(id)))!.payload.refresh_token;
      world.google.config.issue_refresh = false;

      const { callbackUrl } = await connect(world, OWNER, { connection_id: id, scope_bundle: 'calendar_events' });
      await runCallback(world, callbackUrl, owner);

      expect((await world.vault.get(world.secretRef(id)))!.payload.refresh_token).toBe(before);
    });
  });

  it('Notion: no PKCE, non-expiring token, account from the token response, no refresh token', async () => {
    const world = buildWorld();
    const started = await world.start.execute({
      context: world.context(OWNER),
      provider_id: 'notion',
      scope_bundle: 'workspace_content',
      owner_scope: 'workspace',
    });
    expect(new URL(started.authorization_url).searchParams.has('code_challenge')).toBe(false);
    const result = await runCallback(world, world.notion.authorize(started.authorization_url), owner);

    expect(result.result).toBe('connected');
    const connection = (await world.connections.findById(WS_A, result.connection_id!))!;
    expect(connection).toMatchObject({ provider_id: 'notion', external_account_id: 'notion-ws-1', account_label: 'Toko Laris' });
    expect(connection.access_expires_at).toBeNull();
    const secret = await world.vault.get(world.secretRef(connection.id, WS_A, 'notion'));
    expect(secret?.payload.refresh_token ?? null).toBeNull();
    // The declared-provider table gives Notion to sales, help and insights.
    expect((await world.grants.listByConnection(WS_A, connection.id)).map((g) => g.agent_slug).sort()).toEqual(['sinohelp', 'sinoinsights', 'sinosales']);
  });

  it('a provider that refuses the code (invalid_grant) or is down is an error and creates nothing', async () => {
    const world = buildWorld();
    const { callbackUrl } = await connect(world);
    world.google.revokeAllGrants();
    expect((await runCallback(world, callbackUrl, owner)).result).toBe('error');

    const second = buildWorld();
    const { callbackUrl: url2 } = await connect(second);
    second.google.failNext(503);
    expect((await runCallback(second, url2, owner)).result).toBe('error');
    expect(world.connections.rows.size + second.connections.rows.size).toBe(0);
  });

  it('a vault write failure rolls the connection and the audit back: nothing is half connected', async () => {
    const world = buildWorld();
    const { callbackUrl } = await connect(world);
    const original = world.vault.put.bind(world.vault);
    world.vault.put = async (ref, payload, options) => {
      if (ref.owner_type === 'connection') throw new VaultUnavailableError('down');
      return original(ref, payload, options);
    };
    await expect(runCallback(world, callbackUrl, owner)).rejects.toBeInstanceOf(VaultUnavailableError);
    expect(world.connections.rows.size).toBe(0);
  });

  it('G1: no token, code, state or verifier reaches the log, the audit rows or the redirect', async () => {
    const world = buildWorld();
    capture = captureConsole();
    const { started, callbackUrl } = await connect(world);
    const state = new URL(started.authorization_url).searchParams.get('state')!;
    const code = new URL(callbackUrl).searchParams.get('code')!;
    const verifier = (await world.resolver.forOAuthFlow(world.flows.only())).verifier;

    const result = await runCallback(world, callbackUrl, owner);
    const secret = (await world.vault.get(world.secretRef(result.connection_id!)))!.payload;

    const haystack = [
      capture.text(),
      JSON.stringify(world.audit.rows),
      result.redirect_to,
      JSON.stringify(world.log.lines),
      JSON.stringify([...world.connections.rows.values()]),
      JSON.stringify([...world.grants.rows]),
    ].join('\n');
    for (const value of [state, code, verifier, String(secret.access_token), String(secret.refresh_token)]) {
      expect(haystack, 'a credential leaked').not.toContain(value);
    }
    assertNoMarkers('callback output', haystack, { markers: [] } as never);
  });
});
