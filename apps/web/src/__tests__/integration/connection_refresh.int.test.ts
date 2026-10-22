import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RepositoryAuditLogger } from '@/server/application/audit/repository_audit_logger';
import { ConnectorRegistry } from '@/server/application/connections/connector_registry';
import { CredentialResolver } from '@/server/application/connections/credential_resolver';
import { PROVIDER_MANIFESTS } from '@/server/application/connections/manifests';
import { ConnectionHealthService } from '@/server/application/connections/refresh/connection_health_service';
import { ConnectionIncidentNotifier } from '@/server/application/connections/refresh/connection_incident_notifier';
import {
  CONNECTION_JOBS,
  HealthPlanner,
  RefreshPlanner,
  registerConnectionJobs,
} from '@/server/application/connections/refresh/connection_jobs';
import { ConnectionStateService } from '@/server/application/connections/refresh/connection_state_service';
import { ReconcileConnectionsUseCase } from '@/server/application/connections/refresh/reconcile_connections_use_case';
import { RefreshConnectionTokenUseCase } from '@/server/application/connections/refresh/refresh_connection_token_use_case';
import { JobRunner } from '@/server/application/jobs/job_runner';
import { TickJobsUseCase } from '@/server/application/jobs/tick_jobs_use_case';
import type { ConnectorDriver } from '@/server/domain/connections/connector';
import { GenericOAuth2Driver } from '@/server/infrastructure/connectors/generic_oauth2_driver';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';
import { PrismaAuditRepository } from '@/server/infrastructure/database/prisma_audit_repository';
import { PrismaConnectionRepository } from '@/server/infrastructure/database/prisma_connection_repository';
import { PrismaJobQueue } from '@/server/infrastructure/database/prisma_job_queue';
import { PrismaTransactionRunner } from '@/server/infrastructure/database/prisma_transaction_runner';
import { PrismaVaultSecretRepository } from '@/server/infrastructure/database/prisma_vault_secret_repository';
import { LocalKms } from '@/server/infrastructure/vault/local_kms';
import { VaultService } from '@/server/infrastructure/vault/vault_service';
import { specialistsDeclaring } from '@/shared/specialists/connection_providers';
import { FakeConnectionOAuthProvider } from '../fakes/fake_connection_oauth_provider';
import { RecordingConnectionLog } from '../helpers/connections_world';
import { RecordingInboxCreator } from '../helpers/refresh_world';

// WP-M2-15 on a real Postgres: the queue, the vault compare-and-swap and the
// planners with the real queries.

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
const GOOGLE = PROVIDER_MANIFESTS.find((m) => m.provider_id === 'google_calendar')!;
const T0 = new Date('2026-10-23T10:00:00.000Z');

let WS = '';
let USER = '';

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "platform"."jobs"');
  const workspace = await prisma.workspace.create({ data: { workspace_slug: 'refresh-a', workspace_name: 'A' } });
  const user = await prisma.user.create({ data: { email: 'owner@refresh.test', full_name: 'Owner' } });
  WS = workspace.id;
  USER = user.id;
});

function stack(providerOverrides = {}) {
  const connections = new PrismaConnectionRepository(prisma);
  const vault = new VaultService(
    new PrismaVaultSecretRepository(prisma),
    new LocalKms({ current: `local-refresh:${randomBytes(32).toString('base64')}`, production: false }),
  );
  const provider = new FakeConnectionOAuthProvider(GOOGLE, { rotate_refresh: true, ...providerOverrides });
  const drivers = {
    driverFor: (): ConnectorDriver =>
      new GenericOAuth2Driver(GOOGLE, provider, { client_id: provider.config.client_id, client_secret: provider.config.client_secret }),
  };
  const resolver = new CredentialResolver({ connections, secrets: vault });
  const queue = new PrismaJobQueue(prisma);
  const log = new RecordingConnectionLog();
  const inbox = new RecordingInboxCreator();
  const registry = new ConnectorRegistry(PROVIDER_MANIFESTS, { credentialsAvailable: () => true, specialistsFor: specialistsDeclaring });
  const audit = new RepositoryAuditLogger(new PrismaAuditRepository(prisma));
  const transactions = new PrismaTransactionRunner(prisma);
  const notifier = new ConnectionIncidentNotifier({
    inbox,
    accounts: { findById: async () => null },
    email: { send: async () => undefined },
    workspaces: { findById: async () => ({ workspace_slug: 'refresh-a' }) as never },
    registry,
    appUrl: 'https://app.sineva.test',
    log,
  });
  const state = new ConnectionStateService({ connections, audit, transactions, incidents: notifier });
  const now = () => T0;
  const refresh = new RefreshConnectionTokenUseCase({ connections, resolver, secrets: vault, drivers, audit, transactions, state, log, now });
  const health = new ConnectionHealthService({ connections, resolver, drivers, refresh, state, log, now });
  const reconcile = new ReconcileConnectionsUseCase({ connections, queue, log, now });
  const makeRunner = (workerId: string) => {
    const runner = new JobRunner({ queue, log: { record: () => undefined }, workerId, now, random: () => 0.5 });
    registerConnectionJobs(runner, { refresh, health, reconcile, incidents: notifier, connections, queue });
    return runner;
  };
  return { connections, vault, provider, queue, inbox, log, refresh, health, makeRunner, resolver };
}

/** A connection with real tokens at the fake provider, stored through the vault. */
async function seedConnection(s: ReturnType<typeof stack>, over: { account?: string; status?: string; expiresInMs?: number } = {}) {
  // The fake enforces PKCE, so the challenge must match the verifier used at the exchange.
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const authUrl = new GenericOAuth2Driver(GOOGLE, s.provider, { client_id: 'client-id', client_secret: 'client-secret' }).authorize({
    redirect_uri: 'https://app.sineva.test/cb',
    state: 's',
    scopes: ['openid'],
    client_id: 'client-id',
    code_challenge: challenge,
  }).url;
  const callback = new URL(s.provider.authorize(authUrl));
  const tokens = await new GenericOAuth2Driver(GOOGLE, s.provider, { client_id: 'client-id', client_secret: 'client-secret' }).exchange({
    code: callback.searchParams.get('code')!,
    redirect_uri: 'https://app.sineva.test/cb',
    code_verifier: verifier,
  });
  const connection = await s.connections.create({
    workspace_id: WS,
    provider_id: 'google_calendar',
    owner_scope: 'workspace',
    owner_user_id: null,
    created_by_user_id: USER,
    auth_type: 'oauth2_pkce',
    status: (over.status ?? 'connected') as 'connected',
    scope_bundle: 'calendar_read',
    requested_scopes: ['openid'],
    granted_scopes: ['openid'],
    external_account_id: over.account ?? 'acct-1',
    account_label: 'budi@example.test',
    access_expires_at: new Date(T0.getTime() + (over.expiresInMs ?? 3600_000)),
    refresh_expires_at: null,
    last_refreshed_at: T0,
  });
  await s.vault.put(
    { owner_type: 'connection', owner_id: connection.id, workspace_id: WS, provider_id: 'google_calendar' },
    { access_token: tokens.access_token, refresh_token: tokens.refresh_token, token_type: 'Bearer' },
  );
  return connection;
}

describe('refresh on Postgres (G6)', () => {
  it('two workers with two refresh jobs for one connection: one at a time, the rotated token is kept', async () => {
    const s = stack();
    const connection = await seedConnection(s);
    const payload = { workspace_id: WS, connection_id: connection.id };
    await s.queue.enqueue({ job_type: CONNECTION_JOBS.REFRESH, payload, concurrency_key: `connection:${connection.id}`, idempotency_key: 'a' }, T0);
    await s.queue.enqueue({ job_type: CONNECTION_JOBS.REFRESH, payload, concurrency_key: `connection:${connection.id}`, idempotency_key: 'b' }, T0);

    const results = await Promise.all([s.makeRunner('w1').runBatch(5), s.makeRunner('w2').runBatch(5)]);
    await s.makeRunner('w3').runBatch(5);

    expect(results.reduce((sum, r) => sum + r.failed, 0)).toBe(0);
    expect(await prisma.job.count({ where: { status: 'succeeded' } })).toBe(2);
    const stored = (await s.vault.get({ owner_type: 'connection', owner_id: connection.id, workspace_id: WS, provider_id: 'google_calendar' }))!;
    expect(s.provider.refreshTokenActive(String(stored.payload.refresh_token))).toBe(true);
    expect((await s.connections.findById(WS, connection.id))?.status).toBe('connected');
    expect(s.inbox.items).toHaveLength(0);
  });

  it('invalid_grant fails the job once, marks the row, writes the audit rows and tells the Inbox', async () => {
    const s = stack();
    const connection = await seedConnection(s);
    s.provider.revokeAllGrants();
    await s.queue.enqueue(
      { job_type: CONNECTION_JOBS.REFRESH, payload: { workspace_id: WS, connection_id: connection.id }, concurrency_key: `connection:${connection.id}` },
      T0,
    );

    const result = await s.makeRunner('w1').runBatch(5);

    expect(result.failed).toBe(1);
    const job = await prisma.job.findFirstOrThrow();
    expect(job).toMatchObject({ status: 'failed', attempts: 1, last_error_code: 'invalid_grant' });
    expect((await s.connections.findById(WS, connection.id))?.status).toBe('needs_reconnect');
    expect(await prisma.auditEvent.count({ where: { action: 'connection.needs_reconnect', target_id: connection.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'connection.refresh_failed', target_id: connection.id } })).toBe(1);
    expect(s.inbox.items).toHaveLength(1);
  });
});

describe('connection queries for the planners', () => {
  it('listRefreshCandidates: only usable OAuth connections expiring inside the window, soonest first', async () => {
    const s = stack();
    const soon = await seedConnection(s, { account: 'a', expiresInMs: 10 * 60_000 });
    const later = await seedConnection(s, { account: 'b', expiresInMs: 3 * 3600_000 });
    await seedConnection(s, { account: 'c', expiresInMs: 20 * 3600_000 }); // outside the window
    await seedConnection(s, { account: 'd', status: 'needs_reconnect' });
    await seedConnection(s, { account: 'e', status: 'revoked' });

    const list = await s.connections.listRefreshCandidates(T0, 6 * 3600_000, 50);

    expect(list.map((c) => c.id)).toEqual([soon.id, later.id]);
  });

  it('listHealthDue: never probed or probed before the cut, not revoked, not already needing reconnect', async () => {
    const s = stack();
    const never = await seedConnection(s, { account: 'a' });
    const stale = await seedConnection(s, { account: 'b' });
    const fresh = await seedConnection(s, { account: 'c' });
    await seedConnection(s, { account: 'd', status: 'needs_reconnect' });
    await s.connections.update(WS, stale.id, { last_health_at: new Date(T0.getTime() - 30 * 3600_000) });
    await s.connections.update(WS, fresh.id, { last_health_at: new Date(T0.getTime() - 1 * 3600_000) });

    const due = await s.connections.listHealthDue(new Date(T0.getTime() - 24 * 3600_000), 50);

    expect(due.map((c) => c.id).sort()).toEqual([never.id, stale.id].sort());
  });

  it('listActiveAfter pages in id order and skips revoked connections', async () => {
    const s = stack();
    const ids: string[] = [];
    for (const account of ['a', 'b', 'c']) ids.push((await seedConnection(s, { account })).id);
    await seedConnection(s, { account: 'gone', status: 'revoked' });
    const sorted = [...ids].sort();

    const first = await s.connections.listActiveAfter(null, 2);
    expect(first.map((c) => c.id)).toEqual(sorted.slice(0, 2));
    const second = await s.connections.listActiveAfter(first[1]!.id, 2);
    expect(second.map((c) => c.id)).toEqual(sorted.slice(2));
  });
});

describe('the tick on Postgres', () => {
  it('two ticks racing plan one refresh job per connection and the connection ends refreshed', async () => {
    const s = stack();
    const connection = await seedConnection(s, { expiresInMs: 6 * 60_000 }); // due now
    const runnerFor = (id: string) => s.makeRunner(id);
    const planner = new RefreshPlanner({ connections: s.connections, queue: s.queue, random: () => 0.5 });
    const healthPlanner = new HealthPlanner({ connections: s.connections, queue: s.queue });
    const tick = (id: string) =>
      new TickJobsUseCase({ queue: s.queue, runner: runnerFor(id), planners: [planner, healthPlanner], log: { record: () => undefined }, now: () => T0 });

    const [a, b] = await Promise.all([tick('t1').execute({ max_jobs: 10 }), tick('t2').execute({ max_jobs: 10 })]);

    expect(a.planned + b.planned).toBe(2); // one refresh and one health probe, never doubled
    expect(await prisma.job.count({ where: { job_type: CONNECTION_JOBS.REFRESH } })).toBe(1);
    await tick('t3').execute({ max_jobs: 10 });
    expect((await s.connections.findById(WS, connection.id))?.last_refreshed_at?.getTime()).toBe(T0.getTime());
    expect(await prisma.job.count({ where: { status: 'failed' } })).toBe(0);
  });
});
