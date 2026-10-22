import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { ConnectionEntity } from '@/server/domain/connections/connection';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { ConnectionIncidentNotifier } from './connection_incident_notifier';

export interface ConnectionStateDeps {
  connections: ConnectionRepository;
  audit: AuditLogger;
  transactions: TransactionRunner;
  incidents: Pick<ConnectionIncidentNotifier, 'needsReconnect'>;
}

/** The actor of background work: the system, with the job or request as the trace id. */
export function systemContext(workspaceId: string, requestId: string): RequestContext {
  return {
    user_id: 'system:connections',
    workspace_id: workspaceId,
    session_id: 'system',
    request_id: requestId,
    actor: { type: 'system', id: 'connections' },
  };
}

export class ConnectionStateService {
  constructor(private readonly deps: ConnectionStateDeps) {}

  /**
   * The one way a connection becomes `needs_reconnect` (refresh refused, health
   * probe rejected, reconcile after a restore). The status change and its audit
   * events commit together; the person is told afterwards, outside the
   * transaction, so a slow mail server cannot hold it open.
   */
  async markNeedsReconnect(
    connection: ConnectionEntity,
    code: string,
    options: { refresh_failed: boolean; request_id: string },
  ): Promise<ConnectionEntity> {
    const context = systemContext(connection.workspace_id, options.request_id);
    const updated = await this.deps.transactions.run(async () => {
      const row = await this.deps.connections.update(connection.workspace_id, connection.id, {
        status: 'needs_reconnect',
        last_error_code: code,
      });
      const metadata = { provider_id: connection.provider_id, error_code: code };
      if (options.refresh_failed) {
        await this.deps.audit.log({
          action: 'connection.refresh_failed',
          context,
          workspace_id: connection.workspace_id,
          target_resource_type: 'connection',
          target_resource_id: connection.id,
          metadata,
        });
      }
      await this.deps.audit.log({
        action: 'connection.needs_reconnect',
        context,
        workspace_id: connection.workspace_id,
        target_resource_type: 'connection',
        target_resource_id: connection.id,
        metadata,
      });
      return row;
    });
    const settled = updated ?? { ...connection, status: 'needs_reconnect' as const, last_error_code: code };
    await this.deps.incidents.needsReconnect(settled);
    return settled;
  }
}
