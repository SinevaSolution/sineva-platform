import { randomUUID } from 'node:crypto';
import {
  isVisibleTo,
  type ConnectionEntity,
  type ConnectionPatch,
  type NewConnection,
} from '@/server/domain/connections/connection';
import { ConflictError } from '@/server/domain/errors/domain_error';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';
import type { FakeTransactionRunner } from './fake_transaction_runner';

/** Unit-test stand-in obeying the same tenant and duplicate rules as the Postgres adapter. */
export class InMemoryConnectionRepository implements ConnectionRepository {
  readonly rows = new Map<string, ConnectionEntity>();
  now: () => Date = () => new Date();
  /** When set, writes made inside a transaction scope are undone if the scope rolls back. */
  tx: FakeTransactionRunner | null = null;

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
      last_refreshed_at: input.last_refreshed_at ?? null,
      last_health_at: null,
      last_error_code: null,
      secret_rotated_at: input.secret_rotated_at ?? null,
      revoked_at: null,
      revoked_by_user_id: null,
      created_at: at,
      updated_at: at,
    };
    this.rows.set(row.id, row);
    if (this.tx?.active) this.tx.onRollback(() => this.rows.delete(row.id));
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

  async findActiveByAccount(
    workspaceId: string,
    providerId: string,
    ownerUserId: string | null,
    externalAccountId: string,
  ): Promise<ConnectionEntity | null> {
    const row = [...this.rows.values()].find(
      (candidate) =>
        candidate.workspace_id === workspaceId &&
        candidate.provider_id === providerId &&
        (candidate.owner_user_id ?? '') === (ownerUserId ?? '') &&
        candidate.external_account_id === externalAccountId &&
        candidate.status !== 'revoked',
    );
    return row ? { ...row } : null;
  }

  async listRefreshCandidates(now: Date, windowMs: number, limit: number): Promise<ConnectionEntity[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          ['connected', 'partial'].includes(row.status) &&
          row.auth_type === 'oauth2_pkce' &&
          row.access_expires_at !== null &&
          row.access_expires_at.getTime() <= now.getTime() + windowMs,
      )
      .sort((a, b) => a.access_expires_at!.getTime() - b.access_expires_at!.getTime())
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }

  async listRotationDue(rotatedBefore: Date, limit: number): Promise<ConnectionEntity[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.auth_type === 'api_key' &&
          ['connected', 'partial', 'error'].includes(row.status) &&
          (row.secret_rotated_at ?? row.created_at).getTime() < rotatedBefore.getTime(),
      )
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }

  async listHealthDue(checkedBefore: Date, limit: number): Promise<ConnectionEntity[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.status !== 'revoked' &&
          row.status !== 'needs_reconnect' &&
          (row.last_health_at === null || row.last_health_at.getTime() < checkedBefore.getTime()),
      )
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }

  async listActiveAfter(afterId: string | null, limit: number): Promise<ConnectionEntity[]> {
    return [...this.rows.values()]
      .filter((row) => row.status !== 'revoked' && (afterId === null || row.id > afterId))
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }

  async listVisible(
    workspaceId: string,
    viewerUserId: string,
    filter: { provider_id?: string; status?: ConnectionEntity['status']; include_revoked?: boolean } = {},
  ): Promise<ConnectionEntity[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.workspace_id === workspaceId &&
          isVisibleTo(row, viewerUserId) &&
          (!filter.provider_id || row.provider_id === filter.provider_id) &&
          (!filter.status || row.status === filter.status) &&
          (filter.include_revoked || filter.status === 'revoked' || row.status !== 'revoked'),
      )
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      .map((row) => ({ ...row }));
  }

  async listActiveByProvider(providerId: string, limit: number): Promise<ConnectionEntity[]> {
    return [...this.rows.values()]
      .filter((row) => row.provider_id === providerId && row.status !== 'revoked')
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }

  async countActive(workspaceId: string): Promise<number> {
    return [...this.rows.values()].filter((row) => row.workspace_id === workspaceId && row.status !== 'revoked').length;
  }

  async update(workspaceId: string, id: string, patch: ConnectionPatch): Promise<ConnectionEntity | null> {
    const row = this.rows.get(id);
    if (!row || row.workspace_id !== workspaceId) return null;
    if (this.tx?.active) {
      const before = { ...row };
      this.tx.onRollback(() => Object.assign(row, before));
    }
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
