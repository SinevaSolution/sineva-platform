import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RepositoryAuditLogger } from '@/server/application/audit/repository_audit_logger';
import { ConnectorRegistry } from '@/server/application/connections/connector_registry';
import { CredentialResolver } from '@/server/application/connections/credential_resolver';
import { PROVIDER_MANIFESTS } from '@/server/application/connections/manifests';
import { HandleOAuthCallbackUseCase } from '@/server/application/connections/oauth/handle_oauth_callback_use_case';
import { sha256Hex } from '@/server/application/connections/oauth/oauth_support';
import { StartOAuthFlowUseCase } from '@/server/application/connections/oauth/start_oauth_flow_use_case';
import type { ConnectorDriver } from '@/server/domain/connections/connector';
import type { RequestContext } from '@/server/domain/context/request_context';
import { VaultUnavailableError } from '@/server/domain/vault/vault';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';
import { PrismaAuditRepository } from '@/server/infrastructure/database/prisma_audit_repository';
import { PrismaConnectionGrantRepository } from '@/server/infrastructure/database/prisma_connection_grant_repository';
import { PrismaConnectionRepository } from '@/server/infrastructure/database/prisma_connection_repository';
import { PrismaOAuthFlowRepository } from '@/server/infrastructure/database/prisma_oauth_flow_repository';
import { PrismaTransactionRunner } from '@/server/infrastructure/database/prisma_transaction_runner';
import { PrismaVaultSecretRepository } from '@/server/infrastructure/database/prisma_vault_secret_repository';
import { PrismaWorkspaceMemberRepository } from '@/server/infrastructure/database/prisma_workspace_member_repository';
import { PrismaWorkspaceRepository } from '@/server/infrastructure/database/prisma_workspace_repository';
import { GenericOAuth2Driver } from '@/server/infrastructure/connectors/generic_oauth2_driver';
import { LocalKms } from '@/server/infrastructure/vault/local_kms';
import { VaultService } from '@/server/infrastructure/vault/vault_service';
import { specialistsDeclaring } from '@/shared/specialists/connection_providers';
import { allowAllEntitlements } from '../fakes/allow_all_entitlements';
import { FakeConnectionOAuthProvider } from '../fakes/fake_connection_oauth_provider';
import { RecordingConnectionLog } from '../helpers/connections_world';

// WP-M2-14 on a real Postgres: the single-use state, the unique account index,
// the transaction around connection, grants, audit and secret, and the vault.

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
const REDIRECT = 'https://app.sineva.test/api/v1/connections/oauth/callback';
const GOOGLE = PROVIDER_MANIFESTS.find((m) => m.provider_id === 'google_calendar')!;

const flows = new PrismaOAuthFlowRepository(prisma);
const connections = new PrismaConnectionRepository(prisma);
const grants = new PrismaConnectionGrantRepository(prisma);
const vault = new VaultService(
  new PrismaVaultSecretRepository(prisma),
  new LocalKms({ current: `local-oauth:${randomBytes(32).toString('base64')}`, production: false }),
);
const resolver = new CredentialResolver({ connections, secrets: vault });
const audit = new RepositoryAuditLogger(new PrismaAuditRepository(prisma));
const transactions = new PrismaTransactionRunner(prisma);
const registry = new ConnectorRegistry(PROVIDER_MANIFESTS, { credentialsAvailable: () => true, specialistsFor: specialistsDeclaring });

let WS = '';
let OWNER = '';

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  const workspace = await prisma.workspace.create({ data: { workspace_slug: 'oauth-a', workspace_name: 'A' } });
  const owner = await prisma.user.create({ data: { email: 'owner@oauth.test', full_name: 'Owner' } });
  await prisma.workspaceMember.create({ data: { workspace_id: workspace.id, user_id: owner.id, role: 'owner' } });
  WS = workspace.id;
  OWNER = owner.id;
});

function harness(overrides: { vault?: VaultService } = {}) {
  const provider = new FakeConnectionOAuthProvider(GOOGLE);
  const drivers = {
    driverFor: (): ConnectorDriver =>
      new GenericOAuth2Driver(GOOGLE, provider, { client_id: provider.config.client_id, client_secret: provider.config.client_secret }),
  };
  const secrets = overrides.vault ?? vault;
  const start = new StartOAuthFlowUseCase({
    registry,
    drivers,
    flows,
    connections,
    secrets,
    workspaces: new PrismaWorkspaceRepository(prisma),
    audit,
    entitlements: allowAllEntitlements,
    redirectUri: REDIRECT,
    clientIdFor: () => provider.config.client_id,
  });
  const callback = new HandleOAuthCallbackUseCase({
    registry,
    drivers,
    flows,
    connections,
    grants,
    secrets,
    resolver,
    members: new PrismaWorkspaceMemberRepository(prisma),
    audit,
    transactions,
    log: new RecordingConnectionLog(),
  });
  const context = (): RequestContext => ({
    user_id: OWNER,
    workspace_id: WS,
    role: 'owner',
    session_id: 'session-owner',
    request_id: 'req',
    actor: { type: 'user', id: OWNER },
  });
  async function begin() {
    const started = await start.execute({ context: context(), provider_id: 'google_calendar', scope_bundle: 'calendar_read', owner_scope: 'workspace' });
    return provider.authorize(started.authorization_url);
  }
  async function finish(callbackUrl: string) {
    const url = new URL(callbackUrl);
    return callback.execute({
      query: { code: url.searchParams.get('code') ?? undefined, state: url.searchParams.get('state') ?? undefined, iss: url.searchParams.get('iss') ?? undefined },
      session: { user_id: OWNER, session_id: 'session-owner' },
      request_id: 'req_cb',
    });
  }
  return { provider, start, callback, begin, finish };
}

describe('OAuth flow repository (G5)', () => {
  it('consume is single use: of 20 racing callbacks exactly one gets the flow', async () => {
    const h = harness();
    const callbackUrl = await h.begin();
    const state = new URL(callbackUrl).searchParams.get('state')!;
    const results = await Promise.all(Array.from({ length: 20 }, () => flows.consume(sha256Hex(state), new Date())));
    expect(results.filter((flow) => flow !== null)).toHaveLength(1);
    expect(await flows.consume(sha256Hex(state), new Date())).toBeNull();
    expect(await flows.consume(sha256Hex('never-issued'), new Date())).toBeNull();
  });

  it('stores only the state hash', async () => {
    const h = harness();
    const callbackUrl = await h.begin();
    const state = new URL(callbackUrl).searchParams.get('state')!;
    const row = await prisma.oAuthFlow.findFirstOrThrow();
    expect(row.state_hash).toBe(sha256Hex(state));
    expect(JSON.stringify(row)).not.toContain(state);
  });
});

describe('connect on Postgres', () => {
  it('creates the connection, read grants, encrypted tokens and the audit row, and leaves no verifier', async () => {
    const h = harness();
    const result = await h.finish(await h.begin());

    expect(result.result).toBe('connected');
    const row = await prisma.connection.findFirstOrThrow({ where: { id: result.connection_id } });
    expect(row).toMatchObject({ provider_id: 'google_calendar', status: 'connected', workspace_id: WS, external_account_id: 'acct-1' });
    expect((await prisma.connectionGrant.findMany({ where: { connection_id: row.id } })).map((g) => `${g.agent_slug}:${g.access_level}`).sort()).toEqual([
      'sinopeople:read',
      'sinosales:read',
    ]);
    const stored = await prisma.vaultSecret.findFirstOrThrow({ where: { owner_type: 'connection', owner_id: row.id } });
    expect(Buffer.concat([stored.ciphertext, stored.nonce]).toString('latin1')).not.toContain('at-');
    expect((await resolver.forConnection(WS, row.id)).credentials.access_token).toMatch(/^at-/);
    expect(await prisma.vaultSecret.count({ where: { owner_type: 'oauth_flow' } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: 'connection.created', target_id: row.id } })).toBe(1);
    expect(await prisma.oAuthFlow.count({ where: { consumed_at: { not: null } } })).toBe(1);
  });

  it('two flows for one account finishing at the same moment make one connection', async () => {
    const h = harness();
    const [a, b] = await Promise.all([h.begin(), h.begin()]);
    const results = await Promise.all([h.finish(a), h.finish(b)]);
    expect(results.map((r) => r.result).sort()).toEqual(['connected', 'duplicate_account']);
    expect(await prisma.connection.count({ where: { workspace_id: WS } })).toBe(1);
    expect(await prisma.vaultSecret.count({ where: { owner_type: 'connection' } })).toBe(1);
  });

  it('a vault failure rolls the connection, grants and audit row back, and leaves no half connection', async () => {
    const failing = new VaultService(new PrismaVaultSecretRepository(prisma), new LocalKms({ current: `local-fail:${randomBytes(32).toString('base64')}`, production: false }));
    const originalPut = failing.put.bind(failing);
    failing.put = async (ref, payload, options) => {
      if (ref.owner_type === 'connection') throw new VaultUnavailableError('down');
      return originalPut(ref, payload, options);
    };
    const h = harness({ vault: failing });
    await expect(h.finish(await h.begin())).rejects.toBeInstanceOf(VaultUnavailableError);

    expect(await prisma.connection.count()).toBe(0);
    expect(await prisma.connectionGrant.count()).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: 'connection.created' } })).toBe(0);
    expect(await prisma.vaultSecret.count({ where: { owner_type: 'connection' } })).toBe(0);
  });

  it('reconnect keeps the connection id and the grants, on the database', async () => {
    const h = harness();
    const first = await h.finish(await h.begin());
    const id = first.connection_id!;
    await grants.replaceAll(WS, id, [{ agent_slug: 'sinofinance', access_level: 'write' }], OWNER);
    await prisma.connection.update({ where: { id }, data: { status: 'needs_reconnect', last_error_code: 'invalid_grant' } });

    const started = await h.start.execute({ context: { user_id: OWNER, workspace_id: WS, role: 'owner', session_id: 'session-owner', request_id: 'r', actor: { type: 'user', id: OWNER } }, provider_id: 'google_calendar', scope_bundle: 'calendar_read', owner_scope: 'workspace', connection_id: id });
    const result = await h.finish(h.provider.authorize(started.authorization_url));

    expect(result.result).toBe('reconnected');
    expect(result.connection_id).toBe(id);
    expect(await prisma.connection.count()).toBe(1);
    const row = await prisma.connection.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('connected');
    expect(row.last_error_code).toBeNull();
    expect((await prisma.connectionGrant.findMany({ where: { connection_id: id } })).map((g) => `${g.agent_slug}:${g.access_level}`)).toEqual(['sinofinance:write']);
    expect(await prisma.auditEvent.count({ where: { action: 'connection.reconnected', target_id: id } })).toBe(1);
  });
});
