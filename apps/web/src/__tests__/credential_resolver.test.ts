import { randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CredentialResolver } from '@/server/application/connections/credential_resolver';
import { ConnectionUnusableError, type ConnectionEntity } from '@/server/domain/connections/connection';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { VaultDecryptError } from '@/server/domain/vault/vault';
import { LocalKms } from '@/server/infrastructure/vault/local_kms';
import { VaultService } from '@/server/infrastructure/vault/vault_service';
import { InMemoryConnectionRepository } from './fakes/in_memory_connection_repository';
import { InMemoryVaultRepository } from './fakes/in_memory_vault_repository';

const WS = randomUUID();
const OTHER_WS = randomUUID();

describe('CredentialResolver: the single read path to connection secrets (ADR-0036)', () => {
  let connections: InMemoryConnectionRepository;
  let vault: VaultService;
  let resolver: CredentialResolver;
  let connection: ConnectionEntity;

  beforeEach(async () => {
    connections = new InMemoryConnectionRepository();
    vault = new VaultService(
      new InMemoryVaultRepository(),
      new LocalKms({ current: `local-test:${randomBytes(32).toString('base64')}`, production: false }),
    );
    resolver = new CredentialResolver({ connections, secrets: vault });
    connection = await connections.create({
      workspace_id: WS,
      provider_id: 'google_calendar',
      owner_scope: 'workspace',
      owner_user_id: null,
      created_by_user_id: null,
      auth_type: 'oauth2_pkce',
      status: 'connected',
      scope_bundle: 'calendar_read',
      requested_scopes: ['a'],
      granted_scopes: ['a'],
      external_account_id: 'acct-1',
      account_label: 'budi@example.test',
      access_expires_at: null,
      refresh_expires_at: null,
    });
    await vault.put(
      { owner_type: 'connection', owner_id: connection.id, workspace_id: WS, provider_id: 'google_calendar' },
      { access_token: 'tok-1', refresh_token: 'ref-1' },
    );
  });

  it('returns the connection and its decrypted credentials', async () => {
    const resolved = await resolver.forConnection(WS, connection.id);
    expect(resolved.connection.id).toBe(connection.id);
    expect(resolved.credentials).toEqual({ access_token: 'tok-1', refresh_token: 'ref-1' });
    expect(resolved.secret_version).toBe(1);
  });

  it('treats a connection of another workspace as not found', async () => {
    await expect(resolver.forConnection(OTHER_WS, connection.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('fails typed for a connection that needs reconnecting, without touching the vault', async () => {
    await connections.update(WS, connection.id, { status: 'needs_reconnect' });
    const error = await resolver.forConnection(WS, connection.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectionUnusableError);
    expect((error as ConnectionUnusableError).code).toBe('connection_needs_reconnect');
  });

  it('fails typed for a revoked connection', async () => {
    await connections.tombstone(WS, connection.id, { by_user_id: null, at: new Date() });
    const error = await resolver.forConnection(WS, connection.id).catch((e: unknown) => e);
    expect((error as ConnectionUnusableError).code).toBe('connection_revoked');
  });

  it('fails typed for an error status and for a missing secret (never an empty credential)', async () => {
    await connections.update(WS, connection.id, { status: 'error' });
    expect(((await resolver.forConnection(WS, connection.id).catch((e) => e)) as ConnectionUnusableError).code).toBe(
      'connection_unavailable',
    );

    await connections.update(WS, connection.id, { status: 'connected' });
    await vault.erase({ owner_type: 'connection', owner_id: connection.id });
    expect(((await resolver.forConnection(WS, connection.id).catch((e) => e)) as ConnectionUnusableError).code).toBe(
      'connection_needs_reconnect',
    );
  });

  it('lets a decryption failure surface (a copied row is never silently ignored)', async () => {
    // The row was written for another provider: same bytes, wrong context.
    await connections.update(WS, connection.id, {});
    const moved = await connections.create({
      workspace_id: WS,
      provider_id: 'notion',
      owner_scope: 'workspace',
      owner_user_id: null,
      created_by_user_id: null,
      auth_type: 'oauth2_pkce',
      status: 'connected',
      scope_bundle: null,
      requested_scopes: [],
      granted_scopes: [],
      external_account_id: 'acct-2',
      account_label: null,
      access_expires_at: null,
      refresh_expires_at: null,
    });
    await vault.put(
      { owner_type: 'connection', owner_id: moved.id, workspace_id: WS, provider_id: 'google_calendar' },
      { access_token: 'x' },
    );
    await expect(resolver.forConnection(WS, moved.id)).rejects.toBeInstanceOf(VaultDecryptError);
  });
});
