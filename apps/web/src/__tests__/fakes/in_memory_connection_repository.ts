import { randomUUID } from 'node:crypto';
import {
  isVisibleTo,
  type ConnectionEntity,
  type ConnectionPatch,
  type NewConnection,
} from '@/server/domain/connections/connection';
import { ConflictError } from '@/server/domain/errors/domain_error';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';

/** Unit-test stand-in obeying the same tenant and duplicate rules as the Postgres adapter. */
export class InMemoryConnectionRepository implements ConnectionRepository {
  readonly rows = new Map<string, ConnectionEntity>();
  now: () => Date = () => new Date();

  async create(input: NewConnection): Promise<ConnectionEntity> {
    if (input.external_account_id && input.status !== 'revoked') {
      const duplicate = [...this.rows.values()].find(
        (row) =>
          row.workspace_id === input.workspace_id &&
          row.provider_id === input.provider_id &&
          (row.owner_user_id ?? '') === (input.owner_user_id ?? '') &&
          row.external_account_id === input.external_account_id &&
          row.status !== 'revoked',
      );
      if (duplicate) throw new ConflictError('Connection', duplicate.id);
    }
    const at = this.now();
    const row: ConnectionEntity = {
      id: randomUUID(),
      workspace_id: input.workspace_id,
      provider_id: input.provider_id,
      owner_scope: input.owner_scope,
      owner_user_id: input.owner_user_id,
      created_by_user_id: input.created_by_user_id,
      auth_type: input.auth_type,
      status: input.status,
      scope_bundle: input.scope_bundle,
      requested_scopes: [...input.requested_scopes],
      granted_scopes: [...input.granted_scopes],
      external_account_id: input.external_account_id,
      account_label: input.account_label,
      access_expires_at: input.access_expires_at,
      refresh_expires_at: input.refresh_expires_at,
      last_refreshed_at: null,
      last_health_at: null,
      last_error_code: null,
      secret_rotated_at: input.secret_rotated_at ?? null,
      revoked_at: null,
      revoked_by_user_id: null,
      created_at: at,
      updated_at: at,
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async findById(workspaceId: string, id: string): Promise<ConnectionEntity | null> {
    const row = this.rows.get(id);
    return row && row.workspace_id === workspaceId ? { ...row } : null;
  }

  async findVisible(workspaceId: string, id: string, viewerUserId: string): Promise<ConnectionEntity | null> {
    const row = await this.findById(workspaceId, id);
    return row && isVisibleTo(row, viewerUserId) ? row : null;
  }

  async update(workspaceId: string, id: string, patch: ConnectionPatch): Promise<ConnectionEntity | null> {
    const row = this.rows.get(id);
    if (!row || row.workspace_id !== workspaceId) return null;
    Object.assign(row, patch, { updated_at: this.now() });
    return { ...row };
  }

  async tombstone(
    workspaceId: string,
    id: string,
    revoked: { by_user_id: string | null; at: Date },
  ): Promise<ConnectionEntity | null> {
    const row = this.rows.get(id);
    if (!row || row.workspace_id !== workspaceId) return null;
    if (row.status === 'revoked') return { ...row };
    Object.assign(row, {
      status: 'revoked',
      revoked_at: revoked.at,
      revoked_by_user_id: revoked.by_user_id,
      external_account_id: null,
      account_label: null,
      granted_scopes: [],
      access_expires_at: null,
      refresh_expires_at: null,
      updated_at: this.now(),
    });
    return { ...row };
  }
}
