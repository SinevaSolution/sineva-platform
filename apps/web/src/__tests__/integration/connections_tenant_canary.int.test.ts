import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RepositoryAuditLogger } from '@/server/application/audit/repository_audit_logger';
import { ReconnectConnectionUseCase, TestConnectionUseCase } from '@/server/application/connections/connection_actions';
import { ConnectorRegistry } from '@/server/application/connections/connector_registry';
import {
  GetConnectionUseCase,
  ListConnectionActivityUseCase,
  ListConnectionsUseCase,
} from '@/server/application/connections/connection_queries';
import { ConnectionViewBuilder } from '@/server/application/connections/connection_view_builder';
import { CredentialResolver } from '@/server/application/connections/credential_resolver';
import { ConnectionRevoker, DisconnectConnectionUseCase } from '@/server/application/connections/disconnect_connection_use_case';
import { PROVIDER_MANIFESTS } from '@/server/application/connections/manifests';
import { SaveApiKeyConnectionUseCase } from '@/server/application/connections/save_api_key_connection_use_case';
import { UpdateConnectionGrantsUseCase } from '@/server/application/connections/update_connection_grants_use_case';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { UserRole } from '@/server/domain/entities/user';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';
import { PrismaAuditRepository } from '@/server/infrastructure/database/prisma_audit_repository';
import { PrismaConnectionGrantRepository } from '@/server/infrastructure/database/prisma_connection_grant_repository';
import { PrismaConnectionRepository } from '@/server/infrastructure/database/prisma_connection_repository';
import { PrismaTransactionRunner } from '@/server/infrastructure/database/prisma_transaction_runner';
import { PrismaVaultSecretRepository } from '@/server/infrastructure/database/prisma_vault_secret_repository';
import { LocalKms } from '@/server/infrastructure/vault/local_kms';
import { VaultService } from '@/server/infrastructure/vault/vault_service';
import { SPECIALIST_MANIFEST } from '@/shared/specialists/manifest';
import { specialistsDeclaring } from '@/shared/specialists/connection_providers';
import { allowAllEntitlements } from '../fakes/allow_all_entitlements';
import { RecordingConnectionLog } from '../helpers/connections_world';
import { FakeKeyHost } from '../helpers/api_world';
import { ApiKeyDriver } from '@/server/infrastructure/connectors/api_key_driver';

// Plan gate G13 for connections, on Postgres: tenant B cannot see, change or
// disconnect tenant A's connections or its secrets, and a member cannot see
// another member's personal connection. The route canary (src/__tests__/canary)
// proves the routes stop B before any use case; this proves the queries do too.

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
const connections = new PrismaConnectionRepository(prisma);
const grants = new PrismaConnectionGrantRepository(prisma);
const vault = new VaultService(
  new PrismaVaultSecretRepository(prisma),
  new LocalKms({ current: `local-canary:${randomBytes(32).toString('base64')}`, production: false }),
);
const registry = new ConnectorRegistry(PROVIDER_MANIFESTS, { credentialsAvailable: () => true, specialistsFor: specialistsDeclaring });
const specialistSlugs = SPECIALIST_MANIFEST.map((entry) => entry.agent_slug);
const audit = new RepositoryAuditLogger(new PrismaAuditRepository(prisma));
const transactions = new PrismaTransactionRunner(prisma);
const builder = new ConnectionViewBuilder({ registry, grants, specialistSlugs });
const keyHost = new FakeKeyHost();
const drivers = { driverFor: () => new ApiKeyDriver(PROVIDER_MANIFESTS.find((m) => m.provider_id === 'xendit')!, keyHost) };
const resolver = new CredentialResolver({ connections, secrets: vault });
const revoker = new ConnectionRevoker({ connections, grants, resolver, secrets: vault, drivers, audit, transactions, log: new RecordingConnectionLog() });

const list = new ListConnectionsUseCase({ connections, builder });
const get = new GetConnectionUseCase({ connections, builder });
const updateGrants = new UpdateConnectionGrantsUseCase({ registry, connections, grants, audit, transactions, builder, specialistSlugs });
const disconnect = new DisconnectConnectionUseCase({ connections, revoker });
const activity = new ListConnectionActivityUseCase({ connections, audit: new PrismaAuditRepository(prisma) });
const save = new SaveApiKeyConnectionUseCase({ registry, drivers, connections, grants, secrets: vault, audit, transactions, entitlements: allowAllEntitlements, builder });
const reconnect = new ReconnectConnectionUseCase({ connections, start: { execute: async () => { throw new Error('unreachable'); } } as never });
const testConnection = new TestConnectionUseCase({ connections, health: { probe: async () => { throw new Error('unreachable'); } } as never });

const KEY = 'xnd_development_TENANTACANARYabcdefghijklmnop1234';
let WS_A = '';
let WS_B = '';
let ALICE = ''; // owner of A
let BOB = ''; // owner of B
let CAROL = ''; // member of A
let DAVE = ''; // member of A
let SHARED = '';
let PERSONAL = '';

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

const ctx = (user: string, workspace: string, role: UserRole): RequestContext => ({
  user_id: user,
  workspace_id: workspace,
  role,
  session_id: 's',
  request_id: 'r',
  actor: { type: 'user', id: user },
});

beforeEach(async () => {
  const [a, b] = await Promise.all([
    prisma.workspace.create({ data: { workspace_slug: 'canary-a', workspace_name: 'A' } }),
    prisma.workspace.create({ data: { workspace_slug: 'canary-b', workspace_name: 'B' } }),
  ]);
  WS_A = a.id;
  WS_B = b.id;
  const users = await Promise.all(
    ['alice', 'bob', 'carol', 'dave'].map((name) => prisma.user.create({ data: { email: `${name}@canary.test`, full_name: name } })),
  );
  [ALICE, BOB, CAROL, DAVE] = users.map((user) => user.id) as [string, string, string, string];

  keyHost.accepted.add(KEY);
  const shared = await save.execute({ context: ctx(ALICE, WS_A, 'owner'), provider_id: 'xendit', secret: { secret_key: KEY } });
  SHARED = shared.connection.id;
  // A personal connection of Carol, written directly: Google needs a browser flow.
  const personal = await connections.create({
    workspace_id: WS_A,
    provider_id: 'google_calendar',
    owner_scope: 'user',
    owner_user_id: CAROL,
    created_by_user_id: CAROL,
    auth_type: 'oauth2_pkce',
    status: 'connected',
    scope_bundle: 'calendar_read',
    requested_scopes: [],
    granted_scopes: [],
    external_account_id: 'carol-cal',
    account_label: 'carol@example.test',
    access_expires_at: null,
    refresh_expires_at: null,
  });
  PERSONAL = personal.id;
  await vault.put({ owner_type: 'connection', owner_id: PERSONAL, workspace_id: WS_A, provider_id: 'google_calendar' }, { access_token: 'carol-token' });
});

describe('tenant B and the connections of tenant A (G13)', () => {
  it('lists none of them and cannot read one', async () => {
    const b = ctx(BOB, WS_B, 'owner');
    expect((await list.execute({ context: b })).connections).toEqual([]);
    await expect(get.execute({ context: b, connection_id: SHARED })).rejects.toMatchObject({ status: 404 });
    await expect(get.execute({ context: b, connection_id: PERSONAL })).rejects.toMatchObject({ status: 404 });
  });

  it('cannot change grants, rotate the key, disconnect, test, reconnect or read activity', async () => {
    const b = ctx(BOB, WS_B, 'owner');
    await expect(updateGrants.execute({ context: b, connection_id: SHARED, grants: [{ agent_slug: 'sinofinance', read: true, write: false }] })).rejects.toMatchObject({ status: 404 });
    await expect(save.execute({ context: b, provider_id: 'xendit', connection_id: SHARED, secret: { secret_key: KEY } })).rejects.toMatchObject({ status: 404 });
    await expect(disconnect.execute({ context: b, connection_id: SHARED })).rejects.toMatchObject({ status: 404 });
    await expect(testConnection.execute({ context: b, connection_id: SHARED })).rejects.toMatchObject({ status: 404 });
    await expect(reconnect.execute({ context: b, connection_id: PERSONAL })).rejects.toMatchObject({ status: 404 });
    await expect(activity.execute({ context: b, connection_id: SHARED })).rejects.toMatchObject({ status: 404 });

    // Nothing of A moved.
    const row = await prisma.connection.findUniqueOrThrow({ where: { id: SHARED } });
    expect(row.status).toBe('connected');
    expect(await prisma.vaultSecret.count({ where: { owner_id: SHARED } })).toBe(1);
    expect((await prisma.connectionGrant.findMany({ where: { connection_id: SHARED } })).map((g) => g.agent_slug)).toEqual(['sinofinance']);
  });

  it('a connection id of A is no way to reach B secrets, and B secrets stay in B', async () => {
    const own = await connections.create({
      workspace_id: WS_B,
      provider_id: 'xendit',
      owner_scope: 'workspace',
      owner_user_id: null,
      created_by_user_id: BOB,
      auth_type: 'api_key',
      status: 'connected',
      scope_bundle: 'read_only',
      requested_scopes: [],
      granted_scopes: [],
      external_account_id: null,
      account_label: 'b-key',
      access_expires_at: null,
      refresh_expires_at: null,
    });
    // The resolver is scoped by workspace: A's id under B's workspace is not found.
    await expect(resolver.forConnection(WS_B, SHARED)).rejects.toMatchObject({ status: 404 });
    await expect(resolver.forConnection(WS_A, own.id)).rejects.toMatchObject({ status: 404 });
  });

  it('the answers never carry the key, and the key is not in any connection or audit row', async () => {
    const view = JSON.stringify(await list.execute({ context: ctx(ALICE, WS_A, 'owner') }));
    expect(view).not.toContain('TENANTACANARY');
    const rows = JSON.stringify([await prisma.connection.findMany(), await prisma.auditEvent.findMany(), await prisma.connectionGrant.findMany()]);
    expect(rows).not.toContain('TENANTACANARY');
    expect(rows).not.toContain('carol-token');
  });
});

describe("personal connections on Postgres: the filter is in the query", () => {
  it("a member's personal connection is invisible to the other member, the admin and the owner of the workspace", async () => {
    const ids = async (user: string, role: UserRole) =>
      (await list.execute({ context: ctx(user, WS_A, role) })).connections.map((c) => c.id).sort();
    expect(await ids(CAROL, 'member')).toEqual([SHARED, PERSONAL].sort());
    expect(await ids(DAVE, 'member')).toEqual([SHARED]);
    expect(await ids(ALICE, 'owner')).toEqual([SHARED]);
    expect(await ids(ALICE, 'admin')).toEqual([SHARED]);
    await expect(get.execute({ context: ctx(ALICE, WS_A, 'owner'), connection_id: PERSONAL })).rejects.toMatchObject({ status: 404 });
    await expect(disconnect.execute({ context: ctx(ALICE, WS_A, 'owner'), connection_id: PERSONAL })).rejects.toMatchObject({ status: 404 });
    await expect(updateGrants.execute({ context: ctx(ALICE, WS_A, 'owner'), connection_id: PERSONAL, grants: [] })).rejects.toMatchObject({ status: 404 });
  });

  it('the owner of it can disconnect it, and the secret is gone from the vault', async () => {
    const result = await disconnect.execute({ context: ctx(CAROL, WS_A, 'member'), connection_id: PERSONAL });
    expect(result.status).toBe('revoked');
    expect(await prisma.vaultSecret.count({ where: { owner_id: PERSONAL } })).toBe(0);
    const row = await prisma.connection.findUniqueOrThrow({ where: { id: PERSONAL } });
    expect(row).toMatchObject({ status: 'revoked', external_account_id: null, account_label: null, revoked_by_user_id: CAROL });
  });

  it('disconnect on Postgres removes the grants, erases the key and writes one audit row', async () => {
    const result = await disconnect.execute({ context: ctx(ALICE, WS_A, 'owner'), connection_id: SHARED });
    expect(result.provider_revoked).toBe(false);
    expect(await prisma.connectionGrant.count({ where: { connection_id: SHARED } })).toBe(0);
    expect(await prisma.vaultSecret.count({ where: { owner_id: SHARED } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: 'connection.revoked', target_id: SHARED } })).toBe(1);
    const again = await disconnect.execute({ context: ctx(ALICE, WS_A, 'owner'), connection_id: SHARED });
    expect(again.revoked_at).toBe(result.revoked_at);
    expect(await prisma.auditEvent.count({ where: { action: 'connection.revoked', target_id: SHARED } })).toBe(1);
  });

  it('activity on Postgres lists the audit rows of the connection, newest first, and pages', async () => {
    for (const slugs of [['sinofinance'], ['sinofinance', 'sinoinsights'], []]) {
      await updateGrants.execute({
        context: ctx(ALICE, WS_A, 'owner'),
        connection_id: SHARED,
        grants: slugs.map((agent_slug) => ({ agent_slug, read: true, write: false })),
      });
    }
    const first = await activity.execute({ context: ctx(ALICE, WS_A, 'owner'), connection_id: SHARED, limit: 2 });
    expect(first.events.map((e) => e.action)).toEqual(['connection.grant_changed', 'connection.grant_changed']);
    expect(first.next_cursor).not.toBeNull();
    const second = await activity.execute({ context: ctx(ALICE, WS_A, 'owner'), connection_id: SHARED, limit: 2, cursor: first.next_cursor! });
    expect(second.events.map((e) => e.action)).toEqual(['connection.grant_changed', 'connection.created']);
    expect(second.next_cursor).toBeNull();
  });

  it('a grants change that fails its audit row leaves the old matrix in place (one transaction)', async () => {
    const failingAudit = {
      log: async () => {
        throw new Error('audit down');
      },
    };
    const broken = new UpdateConnectionGrantsUseCase({ registry, connections, grants, audit: failingAudit, transactions, builder, specialistSlugs });
    await expect(
      broken.execute({ context: ctx(ALICE, WS_A, 'owner'), connection_id: SHARED, grants: [{ agent_slug: 'sinoinsights', read: true, write: false }] }),
    ).rejects.toThrow('audit down');
    expect((await prisma.connectionGrant.findMany({ where: { connection_id: SHARED } })).map((g) => g.agent_slug)).toEqual(['sinofinance']);
  });
});
