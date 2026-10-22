import 'server-only';
import {
  type ConnectionEntity,
  type ConnectionPatch,
  type ConnectionStatus,
  type ConnectorAuthType,
  type NewConnection,
  type OwnerScope,
} from '@/server/domain/connections/connection';
import { ConflictError } from '@/server/domain/errors/domain_error';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';
import type { PrismaClient } from './generated/client';
import { activeClient } from './prisma_transaction_runner';

type Row = Awaited<ReturnType<PrismaClient['connection']['findUniqueOrThrow']>>;

export function mapConnection(row: Row): ConnectionEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    provider_id: row.provider_id,
    owner_scope: row.owner_scope as OwnerScope,
    owner_user_id: row.owner_user_id,
    created_by_user_id: row.created_by_user_id,
    auth_type: row.auth_type as ConnectorAuthType,
    status: row.status as ConnectionStatus,
    scope_bundle: row.scope_bundle,
    requested_scopes: row.requested_scopes,
    granted_scopes: row.granted_scopes,
    external_account_id: row.external_account_id,
    account_label: row.account_label,
    access_expires_at: row.access_expires_at,
    refresh_expires_at: row.refresh_expires_at,
    last_refreshed_at: row.last_refreshed_at,
    last_health_at: row.last_health_at,
    last_error_code: row.last_error_code,
    secret_rotated_at: row.secret_rotated_at,
    revoked_at: row.revoked_at,
    revoked_by_user_id: row.revoked_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? {})}` : '';
  return (error as { code?: string } | null)?.code === 'P2002' || text.includes('23505');
}

export class PrismaConnectionRepository implements ConnectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return activeClient(this.prisma);
  }

  async create(input: NewConnection): Promise<ConnectionEntity> {
    try {
      const row = await this.db.connection.create({
        data: {
          workspace_id: input.workspace_id,
          provider_id: input.provider_id,
          owner_scope: input.owner_scope,
          owner_user_id: input.owner_user_id,
          created_by_user_id: input.created_by_user_id,
          auth_type: input.auth_type,
          status: input.status,
          scope_bundle: input.scope_bundle,
          requested_scopes: input.requested_scopes,
          granted_scopes: input.granted_scopes,
          external_account_id: input.external_account_id,
          account_label: input.account_label,
          access_expires_at: input.access_expires_at,
          refresh_expires_at: input.refresh_expires_at,
          secret_rotated_at: input.secret_rotated_at ?? null,
        },
      });
      return mapConnection(row);
    } catch (error) {
      // The partial unique index `connections_active_account_idx`: the same
      // external account is already connected for this owner scope.
      if (isUniqueViolation(error)) throw new ConflictError('Connection', input.external_account_id ?? input.provider_id);
      throw error;
    }
  }

  async findById(workspaceId: string, id: string): Promise<ConnectionEntity | null> {
    const row = await this.db.connection.findFirst({ where: { id, workspace_id: workspaceId } });
    return row ? mapConnection(row) : null;
  }

  async findVisible(workspaceId: string, id: string, viewerUserId: string): Promise<ConnectionEntity | null> {
    const row = await this.db.connection.findFirst({
      where: {
        id,
        workspace_id: workspaceId,
        OR: [{ owner_scope: 'workspace' }, { owner_user_id: viewerUserId }],
      },
    });
    return row ? mapConnection(row) : null;
  }

  async update(workspaceId: string, id: string, patch: ConnectionPatch): Promise<ConnectionEntity | null> {
    const result = await this.db.connection.updateMany({
      where: { id, workspace_id: workspaceId },
      data: { ...patch, updated_at: new Date() },
    });
    return result.count === 1 ? this.findById(workspaceId, id) : null;
  }

  async tombstone(
    workspaceId: string,
    id: string,
    revoked: { by_user_id: string | null; at: Date },
  ): Promise<ConnectionEntity | null> {
    // Conditional on not-yet-revoked, so a repeated disconnect keeps the first
    // revocation time and person.
    await this.db.connection.updateMany({
      where: { id, workspace_id: workspaceId, status: { not: 'revoked' } },
      data: {
        status: 'revoked',
        revoked_at: revoked.at,
        revoked_by_user_id: revoked.by_user_id,
        external_account_id: null,
        account_label: null,
        granted_scopes: [],
        access_expires_at: null,
        refresh_expires_at: null,
        updated_at: new Date(),
      },
    });
    return this.findById(workspaceId, id);
  }
}
