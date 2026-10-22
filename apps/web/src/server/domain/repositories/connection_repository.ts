import type {
  ConnectionEntity,
  ConnectionPatch,
  ConnectionStatus,
  NewConnection,
} from '@/server/domain/connections/connection';

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
  /**
   * Connections a person may see: workspace connections and their own personal
   * ones, never another member's. The filter is part of the query, not a step
   * after it. Revoked tombstones only when `include_revoked` is set.
   */
  listVisible(
    workspaceId: string,
    viewerUserId: string,
    filter?: { provider_id?: string; status?: ConnectionStatus; include_revoked?: boolean },
  ): Promise<ConnectionEntity[]>;
  /** Non-revoked connections of one provider across workspaces, for the incident runbook. */
  listActiveByProvider(providerId: string, limit: number): Promise<ConnectionEntity[]>;
  /** Non-revoked connections of the workspace, personal ones included: the figure the plan limit counts. */
  countActive(workspaceId: string): Promise<number>;
  /**
   * OAuth connections in a usable status whose access token expires within
   * `windowMs` of `now`, soonest first. System readers: no viewer filter, no
   * secret. The refresh planner decides from these when each one is due.
   */
  listRefreshCandidates(now: Date, windowMs: number, limit: number): Promise<ConnectionEntity[]>;
  /** Pasted-key connections whose key was last saved before `rotatedBefore`, for the 90 day reminder. */
  listRotationDue(rotatedBefore: Date, limit: number): Promise<ConnectionEntity[]>;
  /** Connections not revoked whose last health probe is older than `checkedBefore` (or never ran). */
  listHealthDue(checkedBefore: Date, limit: number): Promise<ConnectionEntity[]>;
  /** Non-revoked connections in id order after `afterId`, for the reconcile sweep. */
  listActiveAfter(afterId: string | null, limit: number): Promise<ConnectionEntity[]>;
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
