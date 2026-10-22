import {
  ConnectionUnusableError,
  type ConnectionEntity,
  type ConnectionStatus,
} from '@/server/domain/connections/connection';
import type { ConnectionLog } from '@/server/domain/connections/connection_errors';
import { ConnectorAuthError, ConnectorUnreachableError } from '@/server/domain/connections/connector';
import type { ConnectorDriverResolver } from '@/server/domain/connections/driver_resolver';
import { FatalJobError, RetryableJobError } from '@/server/domain/jobs/job';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';
import type { CredentialResolver } from '../credential_resolver';
import type { ConnectionStateService } from './connection_state_service';
import type { RefreshConnectionTokenUseCase } from './refresh_connection_token_use_case';

export interface HealthResult {
  result: 'ok' | 'failed';
  status: ConnectionStatus;
  error_code: string | null;
  checked_at: Date;
}

export interface HealthDeps {
  connections: ConnectionRepository;
  resolver: CredentialResolver;
  drivers: ConnectorDriverResolver;
  refresh: Pick<RefreshConnectionTokenUseCase, 'execute'>;
  state: ConnectionStateService;
  log: ConnectionLog;
  now?: () => Date;
}

export interface ProbeOptions {
  request_id?: string;
  /**
   * When the access token is expired or refused, try to refresh it. Background
   * probes run as jobs under the connection's concurrency key, so refreshing there
   * is safe. An on-demand test from the API runs in a request, outside that key,
   * so it must not refresh: it reports what it saw and leaves the token alone.
   */
  allow_recovery?: boolean;
}

/**
 * The cheap "is this connection still good" check (FR-CONN-23): one identity
 * call, recorded as `last_health_at` and `last_error_code`. A rejected
 * credential becomes `needs_reconnect` through the same state service as a
 * failed refresh; an outage is recorded and changes nothing else, because
 * "the provider is down" says nothing about the connection.
 */
export class ConnectionHealthService {
  private readonly now: () => Date;

  constructor(private readonly deps: HealthDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async probe(connection: ConnectionEntity, options: ProbeOptions = {}): Promise<HealthResult> {
    const checkedAt = this.now();
    const requestId = options.request_id ?? `health_${connection.id}`;
    const result = (outcome: 'ok' | 'failed', status: ConnectionStatus, code: string | null): HealthResult => ({
      result: outcome,
      status,
      error_code: code,
      checked_at: checkedAt,
    });

    if (connection.status === 'revoked') return result('failed', 'revoked', 'connection_revoked');
    // Already known broken: do not call the provider again until the person reconnects.
    if (connection.status === 'needs_reconnect') {
      return result('failed', 'needs_reconnect', connection.last_error_code ?? 'needs_reconnect');
    }

    const driver = this.deps.drivers.driverFor(connection.provider_id);
    let outcome: { ok: true } | { ok: false; code: string; status: ConnectionStatus };
    try {
      outcome = await this.check(connection, driver, requestId, options.allow_recovery ?? true);
    } catch (error) {
      if (error instanceof ConnectorUnreachableError || error instanceof RetryableJobError) {
        outcome = { ok: false, code: 'provider_unreachable', status: connection.status };
      } else if (error instanceof FatalJobError) {
        outcome = { ok: false, code: error.code, status: 'error' };
      } else {
        throw error;
      }
    }

    if (outcome.ok) {
      const healed = connection.status === 'error' ? this.healthyStatus(connection) : connection.status;
      await this.deps.connections.update(connection.workspace_id, connection.id, {
        status: healed,
        last_health_at: checkedAt,
        last_error_code: null,
      });
      this.deps.log.metric('health_ok', { provider_id: connection.provider_id });
      return result('ok', healed, null);
    }

    // The state service may already have moved the connection to needs_reconnect.
    const current = await this.deps.connections.findById(connection.workspace_id, connection.id);
    const status = current?.status ?? outcome.status;
    await this.deps.connections.update(connection.workspace_id, connection.id, {
      last_health_at: checkedAt,
      last_error_code: outcome.code,
      ...(status === 'needs_reconnect' ? {} : { status: outcome.status }),
    });
    this.deps.log.metric('health_failed', { provider_id: connection.provider_id, code: outcome.code });
    return result('failed', status === 'needs_reconnect' ? 'needs_reconnect' : outcome.status, outcome.code);
  }

  private healthyStatus(connection: ConnectionEntity): ConnectionStatus {
    return connection.requested_scopes.every((scope) => connection.granted_scopes.includes(scope)) ? 'connected' : 'partial';
  }

  private async check(
    connection: ConnectionEntity,
    driver: ReturnType<ConnectorDriverResolver['driverFor']>,
    requestId: string,
    allowRecovery: boolean,
  ): Promise<{ ok: true } | { ok: false; code: string; status: ConnectionStatus }> {
    let credentials;
    try {
      credentials = (await this.deps.resolver.forProbe(connection.workspace_id, connection.id)).credentials;
    } catch (error) {
      if (error instanceof ConnectionUnusableError && error.code === 'connection_needs_reconnect') {
        await this.deps.state.markNeedsReconnect(connection, 'secret_missing', { refresh_failed: false, request_id: requestId });
        return { ok: false, code: 'secret_missing', status: 'needs_reconnect' };
      }
      throw error;
    }

    if (connection.auth_type === 'api_key') {
      const fields = Object.fromEntries(
        Object.entries(credentials).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      );
      try {
        await driver.whoami({ credentials: fields });
        return { ok: true };
      } catch (error) {
        if (error instanceof ConnectorAuthError) {
          if (error.code === 'access_denied') return { ok: false, code: 'insufficient_permissions', status: 'error' };
          await this.deps.state.markNeedsReconnect(connection, 'invalid_credentials', { refresh_failed: false, request_id: requestId });
          return { ok: false, code: 'invalid_credentials', status: 'needs_reconnect' };
        }
        throw error;
      }
    }

    const accessToken = credentials.access_token;
    const expired = connection.access_expires_at !== null && connection.access_expires_at.getTime() <= this.now().getTime();
    if (typeof accessToken === 'string' && !expired) {
      try {
        await driver.whoami({ access_token: accessToken });
        return { ok: true };
      } catch (error) {
        if (!(error instanceof ConnectorAuthError)) throw error;
        // The provider refused the access token: fall through to recovery.
      }
    }

    // Expired or refused. A token with no expiry (Notion) cannot be refreshed, so a
    // refusal means the person revoked it there.
    if (connection.access_expires_at === null) {
      await this.deps.state.markNeedsReconnect(connection, 'token_rejected', { refresh_failed: false, request_id: requestId });
      return { ok: false, code: 'token_rejected', status: 'needs_reconnect' };
    }
    if (!allowRecovery) return { ok: false, code: 'token_expired', status: connection.status };

    const refreshed = await this.deps.refresh.execute({
      workspace_id: connection.workspace_id,
      connection_id: connection.id,
      request_id: requestId,
    });
    if (refreshed === 'needs_reconnect') {
      const current = await this.deps.connections.findById(connection.workspace_id, connection.id);
      return { ok: false, code: current?.last_error_code ?? 'needs_reconnect', status: 'needs_reconnect' };
    }
    return { ok: true };
  }
}
