import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { ConnectionEntity } from '@/server/domain/connections/connection';
import { ConnectionUnusableError } from '@/server/domain/connections/connection';
import type { ConnectionLog } from '@/server/domain/connections/connection_errors';
import { canManageConnection } from '@/server/domain/connections/connection_policy';
import type { ConnectorDriverResolver } from '@/server/domain/connections/driver_resolver';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ForbiddenError, NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';
import { hasPermission } from '@/server/domain/permissions/registry';
import type { ConnectionGrantRepository } from '@/server/domain/repositories/connection_grant_repository';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { SecretWriter } from '@/server/domain/vault/vault';
import type { ConnectionDisconnectView } from '@/shared/connection_view';
import type { ConnectorRegistry } from './connector_registry';
import type { CredentialResolver } from './credential_resolver';
import { viewerOf } from './connection_view_builder';
import { systemContext } from './refresh/connection_state_service';

export interface RevokerDeps {
  connections: ConnectionRepository;
  grants: ConnectionGrantRepository;
  resolver: CredentialResolver;
  secrets: SecretWriter;
  drivers: ConnectorDriverResolver;
  audit: AuditLogger;
  transactions: TransactionRunner;
  log: ConnectionLog;
  now?: () => Date;
}

/**
 * The one way a connection is taken away (FR-CONN-18, ADR-0036 decision 7), for a
 * person disconnecting and for the incident runbook alike. Order matters: tell the
 * provider (best effort), then erase the secret, then tombstone the row, remove
 * the grants and write the audit event together. The erase comes before the
 * tombstone on purpose: if it fails the connection stays exactly as it was and the
 * caller can try again, whereas a tombstone over a live secret would hide it.
 */
export class ConnectionRevoker {
  private readonly now: () => Date;

  constructor(private readonly deps: RevokerDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async revoke(
    connection: ConnectionEntity,
    options: { context: RequestContext; revoked_by: string | null; reason?: string },
  ): Promise<{ revoked_at: Date; provider_revoked: boolean }> {
    const providerRevoked = await this.revokeAtProvider(connection);

    await this.deps.secrets.erase({ owner_type: 'connection', owner_id: connection.id });

    const revokedAt = this.now();
    const row = await this.deps.transactions.run(async () => {
      await this.deps.grants.replaceAll(connection.workspace_id, connection.id, [], null);
      const tombstone = await this.deps.connections.tombstone(connection.workspace_id, connection.id, {
        by_user_id: options.revoked_by,
        at: revokedAt,
      });
      await this.deps.audit.log({
        action: 'connection.revoked',
        context: options.context,
        workspace_id: connection.workspace_id,
        target_resource_type: 'connection',
        target_resource_id: connection.id,
        metadata: {
          provider_id: connection.provider_id,
          provider_revoked: providerRevoked,
          ...(options.reason ? { reason: options.reason } : {}),
        },
      });
      return tombstone;
    });
    return { revoked_at: row?.revoked_at ?? revokedAt, provider_revoked: providerRevoked };
  }

  /** Best effort: an unreachable or unwilling provider must not keep a person from disconnecting. */
  private async revokeAtProvider(connection: ConnectionEntity): Promise<boolean> {
    // A pasted key has no revoke call at a payment provider; erasing ours is all there is.
    if (connection.auth_type !== 'oauth2_pkce') return false;
    try {
      const { credentials } = await this.deps.resolver.forProbe(connection.workspace_id, connection.id);
      const refresh = typeof credentials.refresh_token === 'string' ? credentials.refresh_token : null;
      const access = typeof credentials.access_token === 'string' ? credentials.access_token : null;
      const token = refresh ?? access;
      if (!token) return false;
      const confirmed = await this.deps.drivers
        .driverFor(connection.provider_id)
        .revoke({ token, token_type: refresh ? 'refresh_token' : 'access_token' });
      if (!confirmed) {
        this.deps.log.failed('provider_revoke', {
          workspace_id: connection.workspace_id,
          connection_id: connection.id,
          provider_id: connection.provider_id,
          code: 'not_confirmed',
        });
      }
      return confirmed;
    } catch (error) {
      // A connection that needs reconnecting has no usable token to revoke: not an incident.
      if (error instanceof ConnectionUnusableError) return false;
      this.deps.log.failed('provider_revoke', {
        workspace_id: connection.workspace_id,
        connection_id: connection.id,
        provider_id: connection.provider_id,
        code: error instanceof Error ? error.name : 'unknown',
      });
      return false;
    }
  }
}

export class DisconnectConnectionUseCase {
  constructor(private readonly deps: { connections: ConnectionRepository; revoker: ConnectionRevoker }) {}

  async execute(input: { context: RequestContext; connection_id: string }): Promise<ConnectionDisconnectView> {
    const viewer = viewerOf(input.context);
    if (!hasPermission(viewer.role, 'connection.disconnect').allowed) {
      throw new ForbiddenError('Permission denied: connection.disconnect');
    }
    const connection = await this.deps.connections.findVisible(viewer.workspace_id, input.connection_id, viewer.user_id);
    if (!connection) throw new NotFoundError('Connection', input.connection_id);
    if (!canManageConnection(viewer.role, viewer.user_id, connection)) {
      throw new ForbiddenError('You cannot disconnect this connection');
    }
    // Repeating a disconnect answers with the first one and writes nothing new.
    if (connection.status === 'revoked') {
      return {
        id: connection.id,
        status: 'revoked',
        revoked_at: (connection.revoked_at ?? connection.updated_at).toISOString(),
        provider_revoked: false,
      };
    }
    const result = await this.deps.revoker.revoke(connection, { context: input.context, revoked_by: viewer.user_id });
    return {
      id: connection.id,
      status: 'revoked',
      revoked_at: result.revoked_at.toISOString(),
      provider_revoked: result.provider_revoked,
    };
  }
}

/**
 * Incident runbook: take every connection of one provider away, in every workspace
 * (a provider breach, a leaked OAuth client secret). Needs the exact confirmation
 * string, works in bounded batches, and acts as the system. Each connection goes
 * through the same revoker as a person's disconnect, so each one is audited.
 */
export class MassRevokeConnectionsUseCase {
  constructor(
    private readonly deps: {
      connections: ConnectionRepository;
      revoker: ConnectionRevoker;
      registry: Pick<ConnectorRegistry, 'provider'>;
    },
  ) {}

  async execute(input: { provider_id: string; confirm: string; limit: number }): Promise<{ revoked: number; more: boolean }> {
    if (!this.deps.registry.provider(input.provider_id)) throw new NotFoundError('Provider', input.provider_id);
    if (input.confirm !== `revoke-all:${input.provider_id}`) {
      throw new ValidationError('Request payload validation failed', [
        { code: 'validation_failed', field: 'confirm', detail: `Send "revoke-all:${input.provider_id}" to confirm` },
      ]);
    }
    const batch = await this.deps.connections.listActiveByProvider(input.provider_id, input.limit);
    for (const connection of batch) {
      await this.deps.revoker.revoke(connection, {
        context: systemContext(connection.workspace_id, `mass_revoke_${input.provider_id}`),
        revoked_by: null,
        reason: 'mass_revoke',
      });
    }
    const remaining = await this.deps.connections.listActiveByProvider(input.provider_id, 1);
    return { revoked: batch.length, more: remaining.length > 0 };
  }
}
