import type { ConnectionEntity, ConnectionPatch, NewConnection } from '@/server/domain/connections/connection';

/**
 * Connection rows (never secrets). Every method takes the workspace: a row of
 * another workspace is never returned, which is the tenant boundary for this
 * table (FR-SEC-03). Personal visibility is a separate, explicit rule.
 */
export interface ConnectionRepository {
  /** Throws `ConflictError` when an active connection already exists for the same account. */
  create(input: NewConnection): Promise<ConnectionEntity>;
  /** Workspace-scoped lookup, not filtered by owner: for jobs and internal callers that act for the system. */
  findById(workspaceId: string, id: string): Promise<ConnectionEntity | null>;
  /** Lookup for a person: workspace connections and the viewer's own personal ones only. */
  findVisible(workspaceId: string, id: string, viewerUserId: string): Promise<ConnectionEntity | null>;
  /** The non-revoked connection for the same external account and owner scope, if any (duplicate detection). */
  findActiveByAccount(
    workspaceId: string,
    providerId: string,
    ownerUserId: string | null,
    externalAccountId: string,
  ): Promise<ConnectionEntity | null>;
  /** Non-revoked connections of the workspace, personal ones included: the figure the plan limit counts. */
  countActive(workspaceId: string): Promise<number>;
  update(workspaceId: string, id: string, patch: ConnectionPatch): Promise<ConnectionEntity | null>;
  /**
   * Marks the connection revoked and clears the account fields, keeping the
   * row as an audit tombstone. Idempotent: an already revoked row is returned unchanged.
   */
  tombstone(
    workspaceId: string,
    id: string,
    revoked: { by_user_id: string | null; at: Date },
  ): Promise<ConnectionEntity | null>;
}
