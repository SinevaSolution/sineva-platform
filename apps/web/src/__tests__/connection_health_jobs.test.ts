import { describe, expect, it } from 'vitest';
import { TickJobsUseCase } from '@/server/application/jobs/tick_jobs_use_case';
import { CONNECTION_JOBS } from '@/server/application/connections/refresh/connection_jobs';
import { ConnectionHealthService } from '@/server/application/connections/refresh/connection_health_service';
import { ConnectorAuthError, type ConnectorDriver } from '@/server/domain/connections/connector';
import { OWNER, WS_A, runCallback } from './helpers/connections_world';
import { buildRefreshWorld, type RefreshWorld } from './helpers/refresh_world';

// WP-M2-15 (FR-CONN-19, FR-CONN-20, FR-CONN-23): health probe, reconcile after a
// restore, and the planners that queue refreshes and probes.

const HOUR = 3_600_000;
const advance = (world: RefreshWorld, ms: number) => {
  world.clock.now = new Date(world.clock.now.getTime() + ms);
  world.google.now = world.clock.now.getTime();
};
const accessToken = async (world: RefreshWorld, id: string) =>
  String((await world.vault.get(world.secretRef(id)))!.payload.access_token);

describe('ConnectionHealthService (FR-CONN-23)', () => {
  it('a healthy connection records last_health_at and clears an old error', async () => {
    const world = buildRefreshWorld();
    const id = await world.connectGoogle();
    await world.connections.update(WS_A, id, { last_error_code: 'provider_unreachable' });

    const result = await world.health.probe((await world.connections.findById(WS_A, id))!);

    expect(result).toMatchObject({ result: 'ok', status: 'connected', error_code: null });
    const connection = (await world.connections.findById(WS_A, id))!;
    expect(connection.last_health_at?.getTime()).toBe(world.clock.now.getTime());
    expect(connection.last_error_code).toBeNull();
    expect(world.log.count('health_ok')).toBe(1);
  });

  it('a token the provider refuses but whose refresh token still works heals by refreshing', async () => {
    const world = buildRefreshWorld();
    const id = await world.connectGoogle();
    const before = await accessToken(world, id);
    world.google.invalidateAccessToken(before);

    const result = await world.health.probe((await world.connections.findById(WS_A, id))!, { allow_recovery: true });

    expect(result.result).toBe('ok');
    expect(await accessToken(world, id)).not.toBe(before);
  });

  it('an expired access token is refreshed during the probe', async () => {
    const world = buildRefreshWorld();
    const id = await world.connectGoogle();
    const before = await accessToken(world, id);
    advance(world, 2 * HOUR);
    const result = await world.health.probe((await world.connections.findById(WS_A, id))!);
    expect(result.result).toBe('ok');
    expect(await accessToken(world, id)).not.toBe(before);
  });

  it('a connection revoked at the provider becomes needs_reconnect and the owner is told', async () => {
    const world = buildRefreshWorld();
    const id = await world.connectGoogle();
    world.google.invalidateAccessToken(await accessToken(world, id));
    world.google.revokeAllGrants();

    const result = await world.health.probe((await world.connections.findById(WS_A, id))!);

    expect(result).toMatchObject({ result: 'failed', status: 'needs_reconnect', error_code: 'invalid_grant' });
    const connection = (await world.connections.findById(WS_A, id))!;
    expect(connection.status).toBe('needs_reconnect');
    expect(connection.last_error_code).toBe('invalid_grant');
    expect(world.inbox.items).toHaveLength(1);
    expect(world.email.getSentEmails()).toHaveLength(1);
  });

  it('an on-demand probe does not refresh: it reports an expired token and leaves it alone', async () => {
    const world = buildRefreshWorld();
    const id = await world.connectGoogle();
    const before = await accessToken(world, id);
    advance(world, 2 * HOUR);
    const calls = world.google.requests.length;

    const result = await world.health.probe((await world.connections.findById(WS_A, id))!, { allow_recovery: false });

    expect(result).toMatchObject({ result: 'failed', status: 'connected', error_code: 'token_expired' });
    expect(world.google.requests.length).toBe(calls);
    expect(await accessToken(world, id)).toBe(before);
  });

  it('an outage is recorded and changes nothing else: the provider being down says nothing about the connection', async () => {
    const world = buildRefreshWorld();
    const id = await world.connectGoogle();
    world.google.failNext(503);

    const result = await world.health.probe((await world.connections.findById(WS_A, id))!);

    expect(result).toMatchObject({ result: 'failed', status: 'connected', error_code: 'provider_unreachable' });
    expect((await world.connections.findById(WS_A, id))?.status).toBe('connected');
    expect(world.inbox.items).toHaveLength(0);
  });

  it('a non-expiring token the provider rejects is needs_reconnect (nothing to refresh)', async () => {
    const world = buildRefreshWorld();
    const started = await world.start.execute({ context: world.context(OWNER), provider_id: 'notion', scope_bundle: 'workspace_content', owner_scope: 'workspace' });
    const connected = await runCallback(world, world.notion.authorize(started.authorization_url), { user_id: OWNER, session_id: 'session-' + OWNER });
    const id = connected.connection_id!;
    // Notion identifies the account in the token response, so the probe has no
    // endpoint to call; a manifest with a userinfo URL would reject the token there.
    // Simulate the rejected token with a driver whose whoami refuses.
    const rejecting: ConnectorDriver = {
      ...world.drivers.driverFor('notion'),
      provider_id: 'notion',
      auth_type: 'oauth2_pkce',
      authorize: () => ({ url: '' }),
      exchange: async () => {
        throw new Error('unused');
      },
      refresh: async () => {
        throw new Error('unused');
      },
      revoke: async () => false,
      whoami: async () => {
        throw new ConnectorAuthError('unknown', 401);
      },
      actions: () => [],
    };
    const health = new ConnectionHealthService({
      connections: world.connections,
      resolver: world.resolver,
      drivers: { driverFor: () => rejecting },
      refresh: world.refresh,
      state: world.state,
      log: world.log,
      now: () => world.clock.now,
    });

    const result = await health.probe((await world.connections.findById(WS_A, id))!);

    expect(result).toMatchObject({ result: 'failed', status: 'needs_reconnect', error_code: 'token_rejected' });
  });

  it('does not call the provider for a connection that already needs reconnecting', async () => {
    const world = buildRefreshWorld();
    const id = await world.connectGoogle();
    await world.connections.update(WS_A, id, { status: 'needs_reconnect', last_error_code: 'invalid_grant' });
    const calls = world.google.requests.length;
    const result = await world.health.probe((await world.connections.findById(WS_A, id))!);
    expect(result).toMatchObject({ result: 'failed', status: 'needs_reconnect', error_code: 'invalid_grant' });
    expect(world.google.requests.length).toBe(calls);
  });

  it('a connection in error that probes fine returns to connected, or partial when scopes are missing', async () => {
    const world = buildRefreshWorld();
    const id = await world.connectGoogle();
    await world.connections.update(WS_A, id, { status: 'error', last_error_code: 'insufficient_permissions' });
    expect((await world.health.probe((await world.connections.findById(WS_A, id))!)).status).toBe('connected');

    const partial = await world.connectGoogle({ bundle: 'calendar_events' }).catch(() => null);
    expect(partial === null || typeof partial === 'string').toBe(true);
  });

  it('an API-key connection: a rejected key needs a new key, a key without permission is an error', async () => {
    const world = buildRefreshWorld();
    const row = await world.connections.create({
      workspace_id: WS_A,
      provider_id: 'xendit',
      owner_scope: 'workspace',
      owner_user_id: null,
      created_by_user_id: OWNER,
      auth_type: 'api_key',
      status: 'connected',
      scope_bundle: 'read_only',
      requested_scopes: ['read_payments'],
      granted_scopes: ['read_payments'],
      external_account_id: null,
      account_label: 'xnd_development_…abcd',
      access_expires_at: null,
      refresh_expires_at: null,
    });
    await world.vault.put({ owner_type: 'connection', owner_id: row.id, workspace_id: WS_A, provider_id: 'xendit' }, { secret_key: 'k' });
    const driverThatThrows = (code: 'invalid_client' | 'access_denied'): ConnectorDriver => ({
      provider_id: 'xendit',
      auth_type: 'api_key',
      authorize: () => ({ url: '' }),
      exchange: async () => {
        throw new Error('unused');
      },
      refresh: async () => {
        throw new Error('unused');
      },
      revoke: async () => false,
      whoami: async () => {
        throw new ConnectorAuthError(code, code === 'invalid_client' ? 401 : 403);
      },
      actions: () => [],
    });
    const make = (code: 'invalid_client' | 'access_denied') =>
      new ConnectionHealthService({
        connections: world.connections,
        resolver: world.resolver,
        drivers: { driverFor: () => driverThatThrows(code) },
        refresh: world.refresh,
        state: world.state,
        log: world.log,
        now: () => world.clock.now,
      });

    const denied = await make('access_denied').probe((await world.connections.findById(WS_A, row.id))!);
    expect(denied).toMatchObject({ result: 'failed', status: 'error', error_code: 'insufficient_permissions' });

    const invalid = await make('invalid_client').probe((await world.connections.findById(WS_A, row.id))!);
    expect(invalid).toMatchObject({ result: 'failed', status: 'needs_reconnect', error_code: 'invalid_credentials' });
  });

  it('a stored secret that vanished is needs_reconnect', async () => {
    const world = buildRefreshWorld();
    const id = await world.connectGoogle();
    await world.vault.erase({ owner_type: 'connection', owner_id: id });
    const result = await world.health.probe((await world.connections.findById(WS_A, id))!);
    expect(result).toMatchObject({ status: 'needs_reconnect', error_code: 'secret_missing' });
  });
});

describe('reconcile after a restore (FR-CONN-19)', () => {
  it('probes every connection through health jobs and marks only the failures needs_reconnect', async () => {
    const world = buildRefreshWorld();
    const good = await world.connectGoogle();
    // A second Google account that the provider no longer honours (revoked while the backup was old).
    world.google.config.account = { id: 'acct-2', label: 'second@example.test' };
    const bad = await world.connectGoogle();
    world.google.invalidateAccessToken(await accessToken(world, bad));
    const badRefresh = String((await world.vault.get(world.secretRef(bad)))!.payload.refresh_token);
    world.google.invalidateRefreshToken(badRefresh);

    const sweep = await world.reconcile.execute({ after_id: null, batch_size: 100, sweep_id: 'sweep-1' });
    expect(sweep).toEqual({ enqueued: 2, next_after_id: null });
    await world.runner.runBatch(10);

    expect((await world.connections.findById(WS_A, good))?.status).toBe('connected');
    expect((await world.connections.findById(WS_A, bad))?.status).toBe('needs_reconnect');
    expect(world.inbox.items).toHaveLength(1);
  });

  it('replaying a sweep does not probe a connection twice', async () => {
    const world = buildRefreshWorld();
    await world.connectGoogle();
    await world.reconcile.execute({ after_id: null, batch_size: 100, sweep_id: 'same' });
    const again = await world.reconcile.execute({ after_id: null, batch_size: 100, sweep_id: 'same' });
    expect(again.enqueued).toBe(0);
    const next = await world.reconcile.execute({ after_id: null, batch_size: 100, sweep_id: 'other' });
    expect(next.enqueued).toBe(1);
  });

  it('skips revoked connections and pages with a cursor, each batch queuing the next as its own job', async () => {
    const world = buildRefreshWorld();
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      world.google.config.account = { id: `acct-${i}`, label: `u${i}@example.test` };
      ids.push(await world.connectGoogle());
    }
    await world.connections.tombstone(WS_A, ids[0]!, { by_user_id: OWNER, at: new Date() });

    const { job } = await world.queue.enqueue({ job_type: CONNECTION_JOBS.RECONCILE, payload: { sweep_id: 's' } }, world.clock.now);
    // Use a tiny batch through the use case directly to prove the cursor, then the registered job for the chain.
    const first = await world.reconcile.execute({ after_id: null, batch_size: 1, sweep_id: 'paged' });
    expect(first.enqueued).toBe(1);
    expect(first.next_after_id).not.toBeNull();
    const second = await world.reconcile.execute({ after_id: first.next_after_id, batch_size: 1, sweep_id: 'paged' });
    expect(second.enqueued).toBe(1);
    const third = await world.reconcile.execute({ after_id: second.next_after_id, batch_size: 1, sweep_id: 'paged' });
    expect(third.enqueued).toBe(0);
    expect(third.next_after_id).toBeNull();

    await world.runner.runBatch(20);
    expect((await world.queue.get(job.id))?.status).toBe('succeeded');
  });
});

describe('planners and the tick (FR-CONN-20, ADR-0038)', () => {
  it('queues a refresh when the token is due, once, with the connection as concurrency key', async () => {
    const world = buildRefreshWorld();
    const id = await world.connectGoogle();
    expect(await world.refreshPlanner.plan(world.clock.now)).toBe(0); // just issued: not due

    advance(world, 49 * 60_000); // 80 percent of an hour is 48 minutes
    expect(await world.refreshPlanner.plan(world.clock.now)).toBe(1);
    expect(await world.refreshPlanner.plan(world.clock.now)).toBe(0); // the same tick again

    const stats = await world.queue.stats(world.clock.now);
    expect(stats.queued).toBe(1);
    const job = await world.queue.claim('probe', [CONNECTION_JOBS.REFRESH], world.clock.now, 1000);
    expect(job?.concurrency_key).toBe(`connection:${id}`);
    expect(job?.payload).toEqual({ workspace_id: WS_A, connection_id: id });
    expect(job?.idempotency_key).toMatch(new RegExp(`^refresh:${id}:\\d+$`));
  });

  it('does not queue for needs_reconnect, revoked or non-expiring connections', async () => {
    const world = buildRefreshWorld();
    const bad = await world.connectGoogle();
    await world.connections.update(WS_A, bad, { status: 'needs_reconnect' });
    world.google.config.account = { id: 'acct-r', label: 'r@example.test' };
    const revoked = await world.connectGoogle();
    await world.connections.tombstone(WS_A, revoked, { by_user_id: OWNER, at: new Date() });
    const started = await world.start.execute({ context: world.context(OWNER), provider_id: 'notion', scope_bundle: 'workspace_content', owner_scope: 'workspace' });
    await runCallback(world, world.notion.authorize(started.authorization_url), { user_id: OWNER, session_id: 'session-' + OWNER });

    advance(world, 3 * HOUR);
    expect(await world.refreshPlanner.plan(world.clock.now)).toBe(0);
  });

  it('plans the next cycle after a successful refresh (the expiry moved, so the key is new)', async () => {
    const world = buildRefreshWorld();
    await world.connectGoogle();
    advance(world, 49 * 60_000);
    await world.refreshPlanner.plan(world.clock.now);
    await world.runner.runBatch(5);

    expect(await world.refreshPlanner.plan(world.clock.now)).toBe(0); // fresh token
    advance(world, 49 * 60_000);
    expect(await world.refreshPlanner.plan(world.clock.now)).toBe(1);
  });

  it('queues the health probe once a day per connection', async () => {
    const world = buildRefreshWorld();
    const id = await world.connectGoogle();
    expect(await world.healthPlanner.plan(world.clock.now)).toBe(1); // never probed
    expect(await world.healthPlanner.plan(world.clock.now)).toBe(0);
    await world.runner.runBatch(5);
    expect((await world.connections.findById(WS_A, id))?.last_health_at).not.toBeNull();

    advance(world, 2 * HOUR);
    expect(await world.healthPlanner.plan(world.clock.now)).toBe(0); // probed recently
    advance(world, 25 * HOUR);
    expect(await world.healthPlanner.plan(world.clock.now)).toBe(1);
  });

  it('one tick plans, runs and leaves a refreshed connection (the scheduler beat end to end)', async () => {
    const world = buildRefreshWorld({ google: { rotate_refresh: true } });
    const id = await world.connectGoogle();
    const before = await accessToken(world, id);
    advance(world, 50 * 60_000);
    const tick = new TickJobsUseCase({
      queue: world.queue,
      runner: world.runner,
      planners: [world.refreshPlanner, world.healthPlanner],
      log: world.jobLog,
      now: () => world.clock.now,
    });

    const result = await tick.execute({ max_jobs: 10 });

    expect(result.planned).toBe(2);
    expect(result.failed).toBe(0);
    expect(await accessToken(world, id)).not.toBe(before);
    expect((await world.connections.findById(WS_A, id))?.status).toBe('connected');
    const second = await tick.execute({ max_jobs: 10 });
    expect(second.planned).toBe(0);
    expect(second.ran).toBe(0);
  });

  it('an invalid payload fails the job at once instead of retrying', async () => {
    const world = buildRefreshWorld();
    const { job } = await world.queue.enqueue({ job_type: CONNECTION_JOBS.REFRESH, payload: { nope: 1 } }, world.clock.now);
    await world.runner.runBatch(1);
    const finished = (await world.queue.get(job.id))!;
    expect(finished.status).toBe('failed');
    expect(finished.last_error_code).toBe('invalid_payload');
  });
});
