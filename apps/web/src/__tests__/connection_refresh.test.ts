import { describe, expect, it } from 'vitest';
import { CONNECTION_JOBS } from '@/server/application/connections/refresh/connection_jobs';
import { ConnectorAuthError } from '@/server/domain/connections/connector';
import type { ConnectorDriver } from '@/server/domain/connections/connector';
import { FatalJobError, RetryableJobError } from '@/server/domain/jobs/job';
import { VaultUnavailableError } from '@/server/domain/vault/vault';
import { captureConsole } from './helpers/canary_secrets';
import { OWNER, WS_A, WS_B } from './helpers/connections_world';
import { buildRefreshWorld, type RefreshWorld } from './helpers/refresh_world';

// WP-M2-15 (FR-CONN-19 to FR-CONN-24, G6): token refresh, single flight, rotating
// refresh tokens, invalid_grant, health and reconcile. The provider is the fake
// with the behaviors a real one has: rotation, single-use codes, outages.

const HOUR = 3_600_000;
const advance = (world: RefreshWorld, ms: number) => {
  world.clock.now = new Date(world.clock.now.getTime() + ms);
  world.google.now = world.clock.now.getTime();
};
const secretOf = async (world: RefreshWorld, id: string) => (await world.vault.get(world.secretRef(id)))!;

describe('RefreshConnectionTokenUseCase', () => {
  it('replaces the access token, moves the expiry, stamps the refresh time and audits it', async () => {
    const world = buildRefreshWorld();
    const id = await world.connectGoogle();
    const before = await secretOf(world, id);
    advance(world, 50 * 60_000);

    const outcome = await world.refresh.execute({ workspace_id: WS_A, connection_id: id });

    expect(outcome).toBe('refreshed');
    const after = await secretOf(world, id);
    expect(after.payload.access_token).not.toBe(before.payload.access_token);
    expect(after.version).toBe(before.version + 1);
    const connection = (await world.connections.findById(WS_A, id))!;
    expect(connection.access_expires_at?.getTime()).toBe(world.clock.now.getTime() + HOUR);
    expect(connection.last_refreshed_at?.getTime()).toBe(world.clock.now.getTime());
    expect(connection.last_error_code).toBeNull();
    expect(connection.status).toBe('connected');
    const event = world.audit.rows.find((row) => row.action === 'connection.token_refreshed')!;
    expect(event.actor_type).toBe('system');
    expect(event.target_id).toBe(id);
    expect(event.metadata).toMatchObject({ provider_id: 'google_calendar', rotated: false });
    expect(world.log.count('refresh_succeeded')).toBe(1);
  });

  it('keeps the existing refresh token when the provider does not issue a new one', async () => {
    const world = buildRefreshWorld();
    const id = await world.connectGoogle();
    const before = (await secretOf(world, id)).payload.refresh_token;
    await world.refresh.execute({ workspace_id: WS_A, connection_id: id });
    expect((await secretOf(world, id)).payload.refresh_token).toBe(before);
  });

  it('FR-CONN-21: a rotating provider gives a new refresh token, which is persisted, and the old one is dead', async () => {
    const world = buildRefreshWorld({ google: { rotate_refresh: true } });
    const id = await world.connectGoogle();
    const first = (await secretOf(world, id)).payload.refresh_token as string;

    await world.refresh.execute({ workspace_id: WS_A, connection_id: id });

    const second = (await secretOf(world, id)).payload.refresh_token as string;
    expect(second).not.toBe(first);
    expect(world.google.refreshTokenActive(first)).toBe(false);
    expect(world.google.refreshTokenActive(second)).toBe(true);
    expect(world.audit.rows.find((row) => row.action === 'connection.token_refreshed')?.metadata).toMatchObject({ rotated: true });
    // And it keeps working: a second refresh with the stored token succeeds.
    expect(await world.refresh.execute({ workspace_id: WS_A, connection_id: id })).toBe('refreshed');
  });

  it('G6: two refreshes racing on a rotating provider never lock the connection out', async () => {
    const world = buildRefreshWorld({ google: { rotate_refresh: true } });
    const id = await world.connectGoogle();

    // Both start from the same stored refresh token, as two workers would without exclusion.
    const outcomes = await Promise.all([
      world.refresh.execute({ workspace_id: WS_A, connection_id: id }),
      world.refresh.execute({ workspace_id: WS_A, connection_id: id }),
    ]);

    // One wins; the loser is told the secret moved under it and stands down, it does not declare a lockout.
    expect(outcomes.filter((outcome) => outcome === 'refreshed')).toHaveLength(1);
    expect(outcomes).not.toContain('needs_reconnect');
    const connection = (await world.connections.findById(WS_A, id))!;
    expect(connection.status).toBe('connected');
    expect(world.audit.rows.some((row) => row.action === 'connection.refresh_failed')).toBe(false);
    expect(world.inbox.items).toHaveLength(0);
    // The stored token is the one the provider considers current.
    const stored = (await secretOf(world, id)).payload.refresh_token as string;
    expect(world.google.refreshTokenActive(stored)).toBe(true);
    expect(await world.refresh.execute({ workspace_id: WS_A, connection_id: id })).toBe('refreshed');
  });

  it('G6: through the job queue, two refresh jobs for one connection run one at a time and leave a usable token', async () => {
    const world = buildRefreshWorld({ google: { rotate_refresh: true } });
    const id = await world.connectGoogle();
    const payload = { workspace_id: WS_A, connection_id: id };
    await world.queue.enqueue({ job_type: CONNECTION_JOBS.REFRESH, payload, concurrency_key: `connection:${id}`, idempotency_key: 'a' }, world.clock.now);
    await world.queue.enqueue({ job_type: CONNECTION_JOBS.REFRESH, payload, concurrency_key: `connection:${id}`, idempotency_key: 'b' }, world.clock.now);

    const results = await Promise.all([world.runner.runBatch(5), world.runner.runBatch(5)]);
    await world.runner.runBatch(5); // the waiting sibling runs after the first finished

    expect(results.reduce((sum, r) => sum + r.failed, 0)).toBe(0);
    const stored = (await secretOf(world, id)).payload.refresh_token as string;
    expect(world.google.refreshTokenActive(stored)).toBe(true);
    expect((await world.connections.findById(WS_A, id))?.status).toBe('connected');
    expect(world.inbox.items).toHaveLength(0);
  });

  describe('invalid_grant (FR-CONN-22)', () => {
    it('stops at once: needs_reconnect, the owner told in the Inbox and by email, audit events written', async () => {
      const world = buildRefreshWorld({ google: { rotate_refresh: true } });
      const id = await world.connectGoogle();
      world.google.revokeAllGrants();

      const outcome = await world.refresh.execute({ workspace_id: WS_A, connection_id: id });

      expect(outcome).toBe('needs_reconnect');
      const connection = (await world.connections.findById(WS_A, id))!;
      expect(connection.status).toBe('needs_reconnect');
      expect(connection.last_error_code).toBe('invalid_grant');
      expect(world.audit.rows.map((row) => row.action)).toEqual(
        expect.arrayContaining(['connection.refresh_failed', 'connection.needs_reconnect']),
      );
      // A system item in the Inbox for the person who set the connection up.
      expect(world.inbox.items).toHaveLength(1);
      expect(world.inbox.items[0]).toMatchObject({
        kind: 'result',
        workspace_id: WS_A,
        recipient_user_id: OWNER,
        source: { type: 'system', id },
        summary_key: 'inbox.sentence.connection_needs_reconnect',
        summary_params: { provider: 'Google Calendar' },
      });
      // And an email in their language, with a link to Connected tools and nothing secret.
      const mail = world.email.getLastEmail()!;
      expect(mail.to).toBe('owner@acme.test');
      expect(mail.template).toBe('connection_needs_reconnect');
      expect(mail.locale).toBe('id');
      expect(mail.rendered.text).toContain('https://app.sineva.test/w/acme/connections');
      expect(world.log.count('refresh_invalid_grant')).toBe(1);
      expect(world.log.count('refresh_failed')).toBe(0);
    });

    it('does not retry: through the queue the job fails once, with the code, and nothing is scheduled again', async () => {
      const world = buildRefreshWorld();
      const id = await world.connectGoogle();
      world.google.revokeAllGrants();
      const { job } = await world.queue.enqueue(
        { job_type: CONNECTION_JOBS.REFRESH, payload: { workspace_id: WS_A, connection_id: id }, concurrency_key: `connection:${id}` },
        world.clock.now,
      );

      await world.runner.runBatch(5);
      advance(world, 24 * HOUR);
      await world.runner.runBatch(5);

      const finished = (await world.queue.get(job.id))!;
      expect(finished.status).toBe('failed');
      expect(finished.attempts).toBe(1);
      expect(finished.last_error_code).toBe('invalid_grant');
      expect(world.google.requests.filter((r) => r.body.includes('refresh_token')).length).toBe(1);
    });

    it('a later job for a connection that already needs reconnecting does not call the provider', async () => {
      const world = buildRefreshWorld();
      const id = await world.connectGoogle();
      world.google.revokeAllGrants();
      await world.refresh.execute({ workspace_id: WS_A, connection_id: id });
      const calls = world.google.requests.length;
      expect(await world.refresh.execute({ workspace_id: WS_A, connection_id: id })).toBe('skipped');
      expect(world.google.requests.length).toBe(calls);
    });

    it('one notification per incident: a repeated mark does not create a second Inbox item', async () => {
      const world = buildRefreshWorld();
      const id = await world.connectGoogle();
      const connection = (await world.connections.findById(WS_A, id))!;
      await world.notifier.needsReconnect(connection);
      await world.notifier.needsReconnect(connection);
      expect(world.inbox.items).toHaveLength(1);
      expect(world.email.getSentEmails()).toHaveLength(1);
    });

    it('a notification failure does not undo the status change, and is logged by step', async () => {
      const world = buildRefreshWorld();
      const id = await world.connectGoogle();
      world.inbox.failWith = new Error('inbox down');
      world.google.revokeAllGrants();

      const outcome = await world.refresh.execute({ workspace_id: WS_A, connection_id: id });

      expect(outcome).toBe('needs_reconnect');
      expect((await world.connections.findById(WS_A, id))?.status).toBe('needs_reconnect');
      expect(world.log.lines.some((line) => line.step === 'inbox_notify_failed')).toBe(true);
    });
  });

  describe('retries (FR-CONN-22)', () => {
    it('an outage is retryable, leaves the status alone and counts as a failure that is not invalid_grant', async () => {
      const world = buildRefreshWorld();
      const id = await world.connectGoogle();
      world.google.failNext(503);

      await expect(world.refresh.execute({ workspace_id: WS_A, connection_id: id })).rejects.toBeInstanceOf(RetryableJobError);

      const connection = (await world.connections.findById(WS_A, id))!;
      expect(connection.status).toBe('connected');
      expect(connection.last_error_code).toBe('provider_unreachable');
      expect(world.log.count('refresh_failed')).toBe(1);
      expect(world.log.count('refresh_invalid_grant')).toBe(0);

      // The next attempt works and clears the error.
      await world.refresh.execute({ workspace_id: WS_A, connection_id: id });
      expect((await world.connections.findById(WS_A, id))?.last_error_code).toBeNull();
    });

    it('through the queue: the job is retried with backoff after an outage and then succeeds', async () => {
      const world = buildRefreshWorld();
      const id = await world.connectGoogle();
      world.google.failNext('network');
      const { job } = await world.queue.enqueue(
        { job_type: CONNECTION_JOBS.REFRESH, payload: { workspace_id: WS_A, connection_id: id }, concurrency_key: `connection:${id}` },
        world.clock.now,
      );

      const first = await world.runner.runBatch(1);
      expect(first.retried).toBe(1);
      expect((await world.queue.get(job.id))?.status).toBe('queued');
      expect((await world.queue.get(job.id))!.run_at.getTime()).toBeGreaterThan(world.clock.now.getTime());

      advance(world, 60_000);
      const second = await world.runner.runBatch(1);
      expect(second.succeeded).toBe(1);
      expect((await world.queue.get(job.id))?.status).toBe('succeeded');
    });

    it('an unexpected provider refusal other than invalid_grant fails the job without retry and without a lockout notice', async () => {
      const world = buildRefreshWorld();
      const id = await world.connectGoogle();
      const failing: ConnectorDriver = {
        ...world.drivers.driverFor('google_calendar'),
        provider_id: 'google_calendar',
        auth_type: 'oauth2_pkce',
        authorize: () => ({ url: '' }),
        exchange: async () => {
          throw new Error('unused');
        },
        refresh: async () => {
          throw new ConnectorAuthError('invalid_client', 401);
        },
        revoke: async () => false,
        whoami: async () => ({ external_account_id: null, account_label: null }),
        actions: () => [],
      };
      const refresh = new (world.refresh.constructor as new (deps: unknown) => typeof world.refresh)({
        connections: world.connections,
        resolver: world.resolver,
        secrets: world.vault,
        drivers: { driverFor: () => failing },
        audit: world.auditLogger,
        transactions: world.transactions,
        state: world.state,
        log: world.log,
        now: () => world.clock.now,
      });
      await expect(refresh.execute({ workspace_id: WS_A, connection_id: id })).rejects.toBeInstanceOf(FatalJobError);
      const connection = (await world.connections.findById(WS_A, id))!;
      expect(connection.status).toBe('error');
      expect(connection.last_error_code).toBe('invalid_client');
      expect(world.inbox.items).toHaveLength(0);
      expect(world.log.count('refresh_failed')).toBe(1);
    });
  });

  describe('persist before use (FR-CONN-21)', () => {
    it('a transient vault write failure is retried in process so the new refresh token is not lost', async () => {
      const world = buildRefreshWorld({ google: { rotate_refresh: true } });
      const id = await world.connectGoogle();
      const original = world.vault.put.bind(world.vault);
      let failures = 1;
      world.vault.put = async (ref, payload, options) => {
        if (ref.owner_type === 'connection' && failures > 0) {
          failures -= 1;
          throw new VaultUnavailableError('blip');
        }
        return original(ref, payload, options);
      };

      expect(await world.refresh.execute({ workspace_id: WS_A, connection_id: id })).toBe('refreshed');

      const stored = (await secretOf(world, id)).payload.refresh_token as string;
      expect(world.google.refreshTokenActive(stored)).toBe(true);
    });

    it('a vault that stays down after the provider rotated the token is a real lockout: needs_reconnect with the reason', async () => {
      const world = buildRefreshWorld({ google: { rotate_refresh: true } });
      const id = await world.connectGoogle();
      world.vault.put = async () => {
        throw new VaultUnavailableError('down');
      };

      await expect(world.refresh.execute({ workspace_id: WS_A, connection_id: id })).rejects.toBeInstanceOf(FatalJobError);

      const connection = (await world.connections.findById(WS_A, id))!;
      expect(connection.status).toBe('needs_reconnect');
      expect(connection.last_error_code).toBe('secret_write_failed');
      expect(world.inbox.items).toHaveLength(1);
    });

    it('a failed persist leaves the connection row and audit untouched (one transaction)', async () => {
      const world = buildRefreshWorld();
      const id = await world.connectGoogle();
      const before = (await world.connections.findById(WS_A, id))!;
      const original = world.vault.put.bind(world.vault);
      world.vault.put = async (ref, payload, options) => {
        if (ref.owner_type === 'connection') throw new VaultUnavailableError('down');
        return original(ref, payload, options);
      };
      world.audit.rows.length = 0;
      await world.refresh.execute({ workspace_id: WS_A, connection_id: id }).catch(() => undefined);
      const after = (await world.connections.findById(WS_A, id))!;
      expect(after.access_expires_at?.getTime()).toBe(before.access_expires_at?.getTime());
      expect(world.audit.rows.some((row) => row.action === 'connection.token_refreshed')).toBe(false);
    });
  });

  it('a stored secret that vanished is needs_reconnect, not a crash', async () => {
    const world = buildRefreshWorld();
    const id = await world.connectGoogle();
    await world.vault.erase({ owner_type: 'connection', owner_id: id });
    expect(await world.refresh.execute({ workspace_id: WS_A, connection_id: id })).toBe('needs_reconnect');
    expect((await world.connections.findById(WS_A, id))?.last_error_code).toBe('secret_missing');
  });

  it('a connection with no refresh token (the provider never issued one) needs reconnecting', async () => {
    const world = buildRefreshWorld({ google: { issue_refresh: false } });
    const id = await world.connectGoogle();
    expect(await world.refresh.execute({ workspace_id: WS_A, connection_id: id })).toBe('needs_reconnect');
    expect((await world.connections.findById(WS_A, id))?.last_error_code).toBe('no_refresh_token');
  });

  it('skips a connection that is gone, revoked or in another workspace, with no provider call', async () => {
    const world = buildRefreshWorld();
    const id = await world.connectGoogle();
    const calls = world.google.requests.length;
    expect(await world.refresh.execute({ workspace_id: WS_B, connection_id: id })).toBe('skipped');
    expect(await world.refresh.execute({ workspace_id: WS_A, connection_id: '99999999-9999-4999-8999-999999999999' })).toBe('skipped');
    await world.connections.tombstone(WS_A, id, { by_user_id: OWNER, at: new Date() });
    expect(await world.refresh.execute({ workspace_id: WS_A, connection_id: id })).toBe('skipped');
    expect(world.google.requests.length).toBe(calls);
  });

  it('a non-expiring provider has nothing to refresh', async () => {
    const world = buildRefreshWorld();
    const started = await world.start.execute({ context: world.context(OWNER), provider_id: 'notion', scope_bundle: 'workspace_content', owner_scope: 'workspace' });
    const { runCallback } = await import('./helpers/connections_world');
    const result = await runCallback(world, world.notion.authorize(started.authorization_url), { user_id: OWNER, session_id: 'session-' + OWNER });
    const calls = world.notion.requests.length;
    expect(await world.refresh.execute({ workspace_id: WS_A, connection_id: result.connection_id! })).toBe('skipped');
    expect(world.notion.requests.length).toBe(calls);
  });

  it('G1: no token reaches the log, the audit rows, the job rows or the mail', async () => {
    const world = buildRefreshWorld({ google: { rotate_refresh: true } });
    const capture = captureConsole();
    try {
      const id = await world.connectGoogle();
      const secret = (await secretOf(world, id)).payload;
      await world.refresh.execute({ workspace_id: WS_A, connection_id: id });
      world.google.revokeAllGrants();
      await world.refresh.execute({ workspace_id: WS_A, connection_id: id });
      const after = (await secretOf(world, id)).payload;
      const haystack = [
        capture.text(),
        JSON.stringify(world.audit.rows),
        JSON.stringify(world.log.lines),
        JSON.stringify(world.log.metrics),
        JSON.stringify(world.inbox.items),
        JSON.stringify(world.email.getSentEmails()),
        JSON.stringify([...world.connections.rows.values()]),
      ].join('\n');
      for (const value of [secret.access_token, secret.refresh_token, after.access_token, after.refresh_token]) {
        expect(haystack).not.toContain(String(value));
      }
    } finally {
      capture.restore();
    }
  });
});
