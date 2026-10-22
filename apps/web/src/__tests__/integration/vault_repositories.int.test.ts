import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CredentialResolver } from '@/server/application/connections/credential_resolver';
import { ConflictError } from '@/server/domain/errors/domain_error';
import { VaultDecryptError, type SecretRef } from '@/server/domain/vault/vault';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';
import { PrismaConnectionRepository } from '@/server/infrastructure/database/prisma_connection_repository';
import { PrismaVaultSecretRepository } from '@/server/infrastructure/database/prisma_vault_secret_repository';
import { LocalKms } from '@/server/infrastructure/vault/local_kms';
import { VaultService } from '@/server/infrastructure/vault/vault_service';

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
const connections = new PrismaConnectionRepository(prisma);
const vault = new VaultService(
  new PrismaVaultSecretRepository(prisma),
  new LocalKms({ current: `local-int:${randomBytes(32).toString('base64')}`, production: false }),
);
const resolver = new CredentialResolver({ connections, secrets: vault });

let WS_A = '';
let WS_B = '';
let ALICE = '';
let BOB = '';

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  const [a, b] = await Promise.all([
    prisma.workspace.create({ data: { workspace_slug: 'vault-a', workspace_name: 'A' } }),
    prisma.workspace.create({ data: { workspace_slug: 'vault-b', workspace_name: 'B' } }),
  ]);
  const [alice, bob] = await Promise.all([
    prisma.user.create({ data: { email: 'alice@vault.test', full_name: 'Alice' } }),
    prisma.user.create({ data: { email: 'bob@vault.test', full_name: 'Bob' } }),
  ]);
  WS_A = a.id;
  WS_B = b.id;
  ALICE = alice.id;
  BOB = bob.id;
});

function newConnection(workspaceId: string, over: Record<string, unknown> = {}) {
  return connections.create({
    workspace_id: workspaceId,
    provider_id: 'google_calendar',
    owner_scope: 'workspace',
    owner_user_id: null,
    created_by_user_id: ALICE,
    auth_type: 'oauth2_pkce',
    status: 'connected',
    scope_bundle: 'calendar_read',
    requested_scopes: ['calendar.readonly'],
    granted_scopes: ['calendar.readonly'],
    external_account_id: 'acct-1',
    account_label: 'budi@example.test',
    access_expires_at: null,
    refresh_expires_at: null,
    ...over,
  });
}

const ref = (workspaceId: string, ownerId: string, provider = 'google_calendar'): SecretRef => ({
  owner_type: 'connection',
  owner_id: ownerId,
  workspace_id: workspaceId,
  provider_id: provider,
});

describe('vault on Postgres (WP-M2-05, G4)', () => {
  it('round-trips a secret and stores no plaintext', async () => {
    const conn = await newConnection(WS_A);
    await vault.put(ref(WS_A, conn.id), { access_token: 'tok-canary-1', refresh_token: 'ref-canary-1' });

    expect((await vault.get(ref(WS_A, conn.id)))?.payload.access_token).toBe('tok-canary-1');
    const raw = await prisma.vaultSecret.findFirstOrThrow({ where: { owner_id: conn.id } });
    const blob = Buffer.concat([raw.ciphertext, raw.nonce, raw.dek_wrapped]).toString('latin1');
    expect(blob).not.toContain('canary');
    expect(raw.kek_id).toBe('local-int');
  });

  it('a row copied between workspaces fails to decrypt (AAD binds the workspace)', async () => {
    const connA = await newConnection(WS_A);
    const connB = await newConnection(WS_B);
    await vault.put(ref(WS_A, connA.id), { access_token: 'tenant-a-token' });

    // The attack: copy tenant A's ciphertext into tenant B's connection row.
    await prisma.$executeRaw`
      INSERT INTO "platform"."vault_secrets"
        ("owner_type", "owner_id", "workspace_id", "provider_id", "ciphertext", "nonce", "dek_wrapped", "kek_id", "key_version")
      SELECT "owner_type", ${connB.id}::uuid, ${WS_B}::uuid, "provider_id", "ciphertext", "nonce", "dek_wrapped", "kek_id", "key_version"
      FROM "platform"."vault_secrets" WHERE "owner_id" = ${connA.id}::uuid`;

    await expect(resolver.forConnection(WS_B, connB.id)).rejects.toBeInstanceOf(VaultDecryptError);
    // Tenant A's own read still works.
    expect((await resolver.forConnection(WS_A, connA.id)).credentials.access_token).toBe('tenant-a-token');
  });

  it('refuses to take over a row id that belongs to another workspace', async () => {
    const connA = await newConnection(WS_A);
    await vault.put(ref(WS_A, connA.id), { access_token: 'a' });
    await expect(vault.put(ref(WS_B, connA.id), { access_token: 'b' })).rejects.toBeInstanceOf(ConflictError);
    expect((await vault.get(ref(WS_A, connA.id)))?.payload.access_token).toBe('a');
  });

  it('compare-and-swap: of two concurrent refresh writes only one wins and no secret is lost', async () => {
    const conn = await newConnection(WS_A);
    await vault.put(ref(WS_A, conn.id), { refresh_token: 'r0' });
    const results = await Promise.allSettled([
      vault.put(ref(WS_A, conn.id), { refresh_token: 'r1' }, { expected_version: 1 }),
      vault.put(ref(WS_A, conn.id), { refresh_token: 'r2' }, { expected_version: 1 }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const stored = (await vault.get(ref(WS_A, conn.id)))!;
    expect(stored.version).toBe(2);
    expect(['r1', 'r2']).toContain(stored.payload.refresh_token);
  });

  it('erase leaves a revoked tombstone and no ciphertext or wrapped key', async () => {
    const conn = await newConnection(WS_A);
    await vault.put(ref(WS_A, conn.id), { access_token: 'x' });

    await vault.erase(ref(WS_A, conn.id));
    const tombstone = await connections.tombstone(WS_A, conn.id, { by_user_id: ALICE, at: new Date() });

    expect(await prisma.vaultSecret.count({ where: { owner_id: conn.id } })).toBe(0);
    expect(tombstone?.status).toBe('revoked');
    expect(tombstone?.revoked_by_user_id).toBe(ALICE);
    expect(tombstone?.external_account_id).toBeNull();
    expect(tombstone?.account_label).toBeNull();
    expect(tombstone?.granted_scopes).toEqual([]);
    // The row itself stays for audit.
    expect(await prisma.connection.count({ where: { id: conn.id } })).toBe(1);
  });

  it('deleting a workspace removes its secrets and connections', async () => {
    const conn = await newConnection(WS_A);
    await vault.put(ref(WS_A, conn.id), { access_token: 'x' });
    await prisma.workspace.delete({ where: { id: WS_A } });
    expect(await prisma.vaultSecret.count({ where: { workspace_id: WS_A } })).toBe(0);
    expect(await prisma.connection.count({ where: { workspace_id: WS_A } })).toBe(0);
  });
});

describe('connection repository on Postgres', () => {
  it('never returns another workspace connection (tenant filter)', async () => {
    const conn = await newConnection(WS_A);
    expect(await connections.findById(WS_B, conn.id)).toBeNull();
    expect(await connections.findVisible(WS_B, conn.id, ALICE)).toBeNull();
    expect((await connections.findById(WS_A, conn.id))?.id).toBe(conn.id);
  });

  it('a personal connection is visible to its owner only', async () => {
    const personal = await newConnection(WS_A, {
      owner_scope: 'user',
      owner_user_id: ALICE,
      external_account_id: 'alice-cal',
    });
    expect((await connections.findVisible(WS_A, personal.id, ALICE))?.id).toBe(personal.id);
    expect(await connections.findVisible(WS_A, personal.id, BOB)).toBeNull();
    const shared = await newConnection(WS_A, { external_account_id: 'shared-cal' });
    expect((await connections.findVisible(WS_A, shared.id, BOB))?.id).toBe(shared.id);
  });

  it('refuses a second active connection for the same account, allows it after revoke', async () => {
    const first = await newConnection(WS_A);
    await expect(newConnection(WS_A)).rejects.toBeInstanceOf(ConflictError);
    // A different owner scope or provider is a different connection.
    await expect(newConnection(WS_A, { provider_id: 'notion' })).resolves.toBeDefined();
    await connections.tombstone(WS_A, first.id, { by_user_id: ALICE, at: new Date() });
    await expect(newConnection(WS_A)).resolves.toBeDefined();
  });

  it('tombstone is idempotent and keeps the first revocation', async () => {
    const conn = await newConnection(WS_A);
    const firstAt = new Date('2026-10-23T10:00:00.000Z');
    const first = await connections.tombstone(WS_A, conn.id, { by_user_id: ALICE, at: firstAt });
    const second = await connections.tombstone(WS_A, conn.id, { by_user_id: BOB, at: new Date() });
    expect(second?.revoked_at?.toISOString()).toBe(first?.revoked_at?.toISOString());
    expect(second?.revoked_by_user_id).toBe(ALICE);
  });

  it('update changes only the connection of the stated workspace', async () => {
    const conn = await newConnection(WS_A);
    expect(await connections.update(WS_B, conn.id, { status: 'error' })).toBeNull();
    expect((await connections.findById(WS_A, conn.id))?.status).toBe('connected');
    expect((await connections.update(WS_A, conn.id, { status: 'needs_reconnect' }))?.status).toBe('needs_reconnect');
  });
});
