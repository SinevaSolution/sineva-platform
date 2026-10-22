import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import {
  ConnectionUnusableError,
  USABLE_CONNECTION_STATUSES,
  type ConnectionEntity,
} from '@/server/domain/connections/connection';
import type { ConnectionLog } from '@/server/domain/connections/connection_errors';
import { ConnectorAuthError, ConnectorUnreachableError } from '@/server/domain/connections/connector';
import type { ConnectorDriverResolver } from '@/server/domain/connections/driver_resolver';
import { ConflictError } from '@/server/domain/errors/domain_error';
import { FatalJobError, RetryableJobError } from '@/server/domain/jobs/job';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import { VaultUnavailableError, type SecretPayload, type SecretWriter } from '@/server/domain/vault/vault';
import type { CredentialResolver, ResolvedCredentials } from '../credential_resolver';
import { ConnectionStateService, systemContext } from './connection_state_service';

export type RefreshOutcome = 'refreshed' | 'skipped' | 'needs_reconnect';

export interface RefreshDeps {
  connections: ConnectionRepository;
  resolver: CredentialResolver;
  secrets: SecretWriter;
  drivers: ConnectorDriverResolver;
  audit: AuditLogger;
  transactions: TransactionRunner;
  state: ConnectionStateService;
  log: ConnectionLog;
  now?: () => Date;
}

// In-process attempts to store a refreshed token. A rotating provider has already
// invalidated the old refresh token by the time we hold the new one, so a vault
// blip must not cost the connection: a few quick tries cover a transient failure.
const PERSIST_ATTEMPTS = 3;

/**
 * Refreshes one connection's access token (FR-CONN-20 to FR-CONN-22). Called by
 * the job runner, never on a request path.
 *
 * Exclusion, in three layers: the job's concurrency key keeps two refreshes of one
 * connection from running at once across processes, a per-connection in-flight map
 * does the same inside one process, and the vault write is a compare-and-swap on
 * the secret's version. If a refresh still races, the loser gets `invalid_grant`
 * and looks at the secret again; finding it moved, it stands down instead of
 * declaring a lockout that did not happen.
 *
 * Failure handling: an outage is retried (`RetryableJobError`); `invalid_grant`
 * stops everything and asks the person to reconnect; any other refusal marks the
 * connection `error` without bothering them.
 */
export class RefreshConnectionTokenUseCase {
  private readonly now: () => Date;
  private readonly inflight = new Map<string, Promise<RefreshOutcome>>();

  constructor(private readonly deps: RefreshDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * In this process, a second refresh of a connection that is already being
   * refreshed waits for the first and reports `skipped`: it must not start
   * from the same refresh token. Across processes the exclusion is the job's
   * concurrency key (ADR-0038), which every caller that can refresh goes through.
   */
  async execute(input: { workspace_id: string; connection_id: string; request_id?: string }): Promise<RefreshOutcome> {
    const key = `${input.workspace_id}:${input.connection_id}`;
    const running = this.inflight.get(key);
    if (running) {
      await running.catch(() => undefined);
      return 'skipped';
    }
    const attempt = this.run(input);
    this.inflight.set(key, attempt);
    try {
      return await attempt;
    } finally {
      this.inflight.delete(key);
    }
  }

  private async run(input: { workspace_id: string; connection_id: string; request_id?: string }): Promise<RefreshOutcome> {
    const requestId = input.request_id ?? `refresh_${input.connection_id}`;
    const connection = await this.deps.connections.findById(input.workspace_id, input.connection_id);
    if (
      !connection ||
      connection.auth_type !== 'oauth2_pkce' ||
      // A token with no expiry (Notion) has nothing to refresh.
      connection.access_expires_at === null ||
      !USABLE_CONNECTION_STATUSES.includes(connection.status)
    ) {
      return 'skipped';
    }

    let resolved: ResolvedCredentials;
    try {
      resolved = await this.deps.resolver.forConnection(connection.workspace_id, connection.id);
    } catch (error) {
      // The row says healthy but the secret is gone (a restore, a manual delete):
      // nothing can be refreshed, the person has to sign in again.
      if (error instanceof ConnectionUnusableError) return this.needsReconnect(connection, 'secret_missing', requestId);
      throw error;
    }

    const refreshToken = resolved.credentials.refresh_token;
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      return this.needsReconnect(connection, 'no_refresh_token', requestId);
    }

    const driver = this.deps.drivers.driverFor(connection.provider_id);
    let tokens;
    try {
      tokens = await driver.refresh({ refresh_token: refreshToken });
    } catch (error) {
      return this.handleProviderFailure(error, connection, resolved, requestId);
    }

    const rotated = tokens.refresh_token !== null && tokens.refresh_token !== refreshToken;
    const payload: SecretPayload = {
      access_token: tokens.access_token,
      token_type: tokens.token_type,
      refresh_token: tokens.refresh_token ?? refreshToken,
    };
    const now = this.now();
    const accessExpiresAt = tokens.expires_in === null ? null : new Date(now.getTime() + tokens.expires_in * 1000);
    return this.persist(connection, resolved, payload, { rotated, accessExpiresAt, now, requestId });
  }

  private async handleProviderFailure(
    error: unknown,
    connection: ConnectionEntity,
    resolved: ResolvedCredentials,
    requestId: string,
  ): Promise<RefreshOutcome> {
    if (error instanceof ConnectorUnreachableError) {
      await this.deps.connections.update(connection.workspace_id, connection.id, { last_error_code: 'provider_unreachable' });
      this.deps.log.metric('refresh_failed', { provider_id: connection.provider_id, code: 'provider_unreachable' });
      throw new RetryableJobError('provider_unreachable', { cause: error });
    }
    if (error instanceof ConnectorAuthError) {
      if (error.code === 'invalid_grant') {
        // Before concluding the grant is dead, check nobody else just rotated it.
        if (await this.secretMovedSince(resolved)) return 'skipped';
        this.deps.log.metric('refresh_invalid_grant', { provider_id: connection.provider_id });
        return this.needsReconnect(connection, 'invalid_grant', requestId);
      }
      // Any other refusal (a wrong client secret, a malformed request) is our
      // configuration or the provider's, not the person's: mark the connection
      // and stop, without a notice that would send them to reconnect for nothing.
      await this.deps.connections.update(connection.workspace_id, connection.id, {
        status: 'error',
        last_error_code: error.code,
      });
      this.deps.log.metric('refresh_failed', { provider_id: connection.provider_id, code: error.code });
      throw new FatalJobError(error.code, { cause: error });
    }
    throw error;
  }

  private async secretMovedSince(resolved: ResolvedCredentials): Promise<boolean> {
    try {
      const current = await this.deps.resolver.forConnection(resolved.connection.workspace_id, resolved.connection.id);
      return current.secret_version !== resolved.secret_version;
    } catch (error) {
      // A connection that changed status or lost its secret in the meantime is also "moved".
      if (error instanceof ConnectionUnusableError) return true;
      throw error;
    }
  }

  private async persist(
    connection: ConnectionEntity,
    resolved: ResolvedCredentials,
    payload: SecretPayload,
    context: { rotated: boolean; accessExpiresAt: Date | null; now: Date; requestId: string },
  ): Promise<RefreshOutcome> {
    const ref = {
      owner_type: 'connection' as const,
      owner_id: connection.id,
      workspace_id: connection.workspace_id,
      provider_id: connection.provider_id,
    };
    for (let attempt = 1; attempt <= PERSIST_ATTEMPTS; attempt += 1) {
      try {
        // The new secret and the new expiry commit together: the vault write is
        // inside the transaction callback, so if it throws, the row and the audit
        // event are not changed.
        await this.deps.transactions.run(async () => {
          await this.deps.secrets.put(ref, payload, { expected_version: resolved.secret_version });
          await this.deps.connections.update(connection.workspace_id, connection.id, {
            access_expires_at: context.accessExpiresAt,
            last_refreshed_at: context.now,
            last_error_code: null,
          });
          await this.deps.audit.log({
            action: 'connection.token_refreshed',
            context: systemContext(connection.workspace_id, context.requestId),
            workspace_id: connection.workspace_id,
            target_resource_type: 'connection',
            target_resource_id: connection.id,
            metadata: { provider_id: connection.provider_id, rotated: context.rotated },
          });
        });
        this.deps.log.metric('refresh_succeeded', { provider_id: connection.provider_id });
        return 'refreshed';
      } catch (error) {
        // Someone else wrote the secret first: their refresh stands, ours is dropped.
        if (error instanceof ConflictError) return 'skipped';
        if (error instanceof VaultUnavailableError && attempt < PERSIST_ATTEMPTS) continue;
        if (error instanceof VaultUnavailableError) return this.persistLost(connection, context);
        throw error;
      }
    }
    return 'skipped';
  }

  /**
   * The provider answered but the new secret could not be stored. If the provider
   * rotates refresh tokens, the old one is already dead and the new one exists only
   * in this process: the connection is locked out, so say so. If it does not
   * rotate, the old token still works and a later attempt can simply try again.
   */
  private async persistLost(
    connection: ConnectionEntity,
    context: { rotated: boolean; requestId: string },
  ): Promise<RefreshOutcome> {
    this.deps.log.metric('refresh_failed', { provider_id: connection.provider_id, code: 'secret_write_failed' });
    if (!context.rotated) throw new RetryableJobError('secret_write_failed');
    await this.needsReconnect(connection, 'secret_write_failed', context.requestId);
    throw new FatalJobError('secret_write_failed');
  }

  private async needsReconnect(connection: ConnectionEntity, code: string, requestId: string): Promise<'needs_reconnect'> {
    await this.deps.state.markNeedsReconnect(connection, code, { refresh_failed: true, request_id: requestId });
    return 'needs_reconnect';
  }
}
