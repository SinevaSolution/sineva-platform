import type { RequestContext } from '@/server/domain/context/request_context';
import { ConnectionRevokedError, NotReconnectableError } from '@/server/domain/connections/connection_errors';
import { canManageConnection } from '@/server/domain/connections/connection_policy';
import { ForbiddenError, NotFoundError } from '@/server/domain/errors/domain_error';
import { hasPermission } from '@/server/domain/permissions/registry';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';
import type { ConnectionTestView } from '@/shared/connection_view';
import type { ConnectionHealthService } from './refresh/connection_health_service';
import type { StartOAuthFlowResult, StartOAuthFlowUseCase } from './oauth/start_oauth_flow_use_case';
import { viewerOf } from './connection_view_builder';

/** The connection when the caller may see it and manage it: not found, then forbidden, then revoked. */
async function manageable(
  connections: ConnectionRepository,
  context: RequestContext,
  connectionId: string,
) {
  const viewer = viewerOf(context);
  const connection = await connections.findVisible(viewer.workspace_id, connectionId, viewer.user_id);
  if (!connection) throw new NotFoundError('Connection', connectionId);
  if (!hasPermission(viewer.role, 'connection.disconnect').allowed || !canManageConnection(viewer.role, viewer.user_id, connection)) {
    throw new ForbiddenError('You cannot manage this connection');
  }
  if (connection.status === 'revoked') throw new ConnectionRevokedError(connection.id);
  return connection;
}

/** Starts a new sign-in for an existing OAuth connection; it keeps its id and grants (FR-CONN-24). */
export class ReconnectConnectionUseCase {
  constructor(private readonly deps: { connections: ConnectionRepository; start: StartOAuthFlowUseCase }) {}

  async execute(input: {
    context: RequestContext;
    connection_id: string;
    scope_bundle?: string;
    return_to?: string;
  }): Promise<StartOAuthFlowResult> {
    const connection = await manageable(this.deps.connections, input.context, input.connection_id);
    // A pasted key is replaced, not signed in again.
    if (connection.auth_type !== 'oauth2_pkce') throw new NotReconnectableError(connection.id);
    return this.deps.start.execute({
      context: input.context,
      provider_id: connection.provider_id,
      scope_bundle: input.scope_bundle,
      owner_scope: connection.owner_scope,
      return_to: input.return_to,
      connection_id: connection.id,
    });
  }
}

/** Runs the health probe now. It never refreshes: a request is outside the connection's job lock. */
export class TestConnectionUseCase {
  constructor(private readonly deps: { connections: ConnectionRepository; health: Pick<ConnectionHealthService, 'probe'> }) {}

  async execute(input: { context: RequestContext; connection_id: string }): Promise<ConnectionTestView> {
    const connection = await manageable(this.deps.connections, input.context, input.connection_id);
    const result = await this.deps.health.probe(connection, {
      request_id: input.context.request_id,
      allow_recovery: false,
    });
    return {
      result: result.result,
      status: result.status,
      error_code: result.error_code,
      checked_at: result.checked_at.toISOString(),
    };
  }
}
