import type { ConnectionStatus } from '@/server/domain/connections/connection';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ForbiddenError, NotFoundError } from '@/server/domain/errors/domain_error';
import { hasPermission } from '@/server/domain/permissions/registry';
import type { AuditEventRepository } from '@/server/domain/repositories/audit_event_repository';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';
import type { ConnectionActivityView, ConnectionView, ProviderView } from '@/shared/connection_view';
import type { ConnectorRegistry } from './connector_registry';
import { ConnectionViewBuilder, viewerOf } from './connection_view_builder';

export class ListProvidersUseCase {
  constructor(private readonly deps: { registry: ConnectorRegistry; builder: ConnectionViewBuilder }) {}

  async execute(input: { context: RequestContext }): Promise<{ providers: ProviderView[] }> {
    const viewer = viewerOf(input.context);
    return { providers: this.deps.registry.providers().map((manifest) => this.deps.builder.providerView(manifest, viewer.role)) };
  }
}

export class ListConnectionsUseCase {
  constructor(private readonly deps: { connections: ConnectionRepository; builder: ConnectionViewBuilder }) {}

  async execute(input: {
    context: RequestContext;
    provider_id?: string;
    status?: ConnectionStatus;
  }): Promise<{ connections: ConnectionView[] }> {
    const viewer = viewerOf(input.context);
    // The visibility rule is in the query: another member's personal connection is never read.
    const rows = await this.deps.connections.listVisible(viewer.workspace_id, viewer.user_id, {
      provider_id: input.provider_id,
      status: input.status,
    });
    return { connections: await this.deps.builder.connectionViews(rows, viewer) };
  }
}

export class GetConnectionUseCase {
  constructor(private readonly deps: { connections: ConnectionRepository; builder: ConnectionViewBuilder }) {}

  async execute(input: { context: RequestContext; connection_id: string }): Promise<{ connection: ConnectionView }> {
    const viewer = viewerOf(input.context);
    const connection = await this.deps.connections.findVisible(viewer.workspace_id, input.connection_id, viewer.user_id);
    if (!connection) throw new NotFoundError('Connection', input.connection_id);
    return { connection: await this.deps.builder.connectionView(connection, viewer) };
  }
}

const DEFAULT_ACTIVITY_LIMIT = 20;
const MAX_ACTIVITY_LIMIT = 50;

/** Audit events whose target is one connection, newest first. No payloads: ids, actions and outcomes only. */
export class ListConnectionActivityUseCase {
  constructor(private readonly deps: { connections: ConnectionRepository; audit: AuditEventRepository }) {}

  async execute(input: {
    context: RequestContext;
    connection_id: string;
    cursor?: string;
    limit?: number;
  }): Promise<ConnectionActivityView> {
    const viewer = viewerOf(input.context);
    if (!hasPermission(viewer.role, 'connection.view_activity').allowed) {
      throw new ForbiddenError('Permission denied: connection.view_activity');
    }
    const connection = await this.deps.connections.findVisible(viewer.workspace_id, input.connection_id, viewer.user_id);
    if (!connection) throw new NotFoundError('Connection', input.connection_id);

    const limit = Math.min(Math.max(input.limit ?? DEFAULT_ACTIVITY_LIMIT, 1), MAX_ACTIVITY_LIMIT);
    const before = input.cursor ? new Date(input.cursor) : undefined;
    // One more than asked, to know whether a next page exists without a count query.
    const rows = await this.deps.audit.select({
      workspace_id: viewer.workspace_id,
      target_type: 'connection',
      target_id: connection.id,
      before: before && !Number.isNaN(before.getTime()) ? before : undefined,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      events: page.map((row) => ({
        id: row.id,
        occurred_at: row.occurred_at,
        action: row.action,
        outcome: row.outcome,
        actor_type: row.actor_type,
        reason_code: row.reason_code,
      })),
      next_cursor: rows.length > limit ? (page[page.length - 1]?.occurred_at ?? null) : null,
    };
  }
}
