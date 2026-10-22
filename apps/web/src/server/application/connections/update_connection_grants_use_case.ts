import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import { ConnectionRevokedError } from '@/server/domain/connections/connection_errors';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ForbiddenError, NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';
import { hasPermission } from '@/server/domain/permissions/registry';
import type { AccessLevel, ConnectionGrantRepository } from '@/server/domain/repositories/connection_grant_repository';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { GrantRowView } from '@/shared/connection_view';
import type { ConnectorRegistry } from './connector_registry';
import { viewerOf, type ConnectionViewBuilder } from './connection_view_builder';

export interface UpdateGrantsDeps {
  registry: ConnectorRegistry;
  connections: ConnectionRepository;
  grants: ConnectionGrantRepository;
  audit: AuditLogger;
  transactions: TransactionRunner;
  builder: ConnectionViewBuilder;
  specialistSlugs: readonly string[];
}

function refuse(code: string, field: string, detail: string): ValidationError {
  return new ValidationError('Request payload validation failed', [{ code, field, detail }]);
}

/**
 * Replaces the access matrix of a connection (FR-CONN-04, ADR-0039). Write access
 * is for Owner and Admin (`connection.grant`), so a member cannot widen access to
 * their own personal connection either; that keeps "write needs Owner or Admin"
 * one rule. Rows that are not listed lose their access, and the whole change is
 * validated before anything is written.
 */
export class UpdateConnectionGrantsUseCase {
  constructor(private readonly deps: UpdateGrantsDeps) {}

  async execute(input: {
    context: RequestContext;
    connection_id: string;
    grants: GrantRowView[];
  }): Promise<{ grants: GrantRowView[] }> {
    const viewer = viewerOf(input.context);
    if (!hasPermission(viewer.role, 'connection.grant').allowed) {
      throw new ForbiddenError('Permission denied: connection.grant');
    }
    const connection = await this.deps.connections.findVisible(viewer.workspace_id, input.connection_id, viewer.user_id);
    if (!connection) throw new NotFoundError('Connection', input.connection_id);
    if (connection.status === 'revoked') throw new ConnectionRevokedError(connection.id);

    const readOnlyProvider = this.deps.registry.isReadOnlyProvider(connection.provider_id);
    const seen = new Set<string>();
    input.grants.forEach((row, index) => {
      const field = `grants.${index}`;
      if (!this.deps.specialistSlugs.includes(row.agent_slug)) {
        throw refuse('unknown_specialist', `${field}.agent_slug`, 'No specialist has this slug');
      }
      if (seen.has(row.agent_slug)) {
        throw refuse('validation_failed', `${field}.agent_slug`, 'Each specialist can appear once');
      }
      seen.add(row.agent_slug);
      if (row.write && !row.read) {
        throw refuse('validation_failed', `${field}.write`, 'Write access needs read access');
      }
      // Payment providers only expose read actions: write would be a promise nothing can keep.
      if (row.write && readOnlyProvider) {
        throw refuse('write_not_supported', `${field}.write`, 'This tool only offers read access');
      }
    });

    const rows = input.grants
      .filter((row) => row.read)
      .map((row) => ({ agent_slug: row.agent_slug, access_level: (row.write ? 'write' : 'read') as AccessLevel }));

    await this.deps.transactions.run(async () => {
      await this.deps.grants.replaceAll(viewer.workspace_id, connection.id, rows, viewer.user_id);
      await this.deps.audit.log({
        action: 'connection.grant_changed',
        context: input.context,
        workspace_id: viewer.workspace_id,
        target_resource_type: 'connection',
        target_resource_id: connection.id,
        metadata: {
          provider_id: connection.provider_id,
          read_count: rows.length,
          write_count: rows.filter((row) => row.access_level === 'write').length,
          agent_slugs: rows.map((row) => row.agent_slug),
        },
      });
    });

    return { grants: this.deps.builder.matrix(await this.deps.grants.listByConnection(viewer.workspace_id, connection.id)) };
  }
}
