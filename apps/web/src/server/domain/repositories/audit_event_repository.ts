import type { AuditEventEntity, NewAuditEventRecord } from '../audit/audit_event';

export interface AuditEventQuery {
  /** Required: every read is tenant-scoped, there is no "all workspaces" read. */
  workspace_id: string;
  action?: string;
  actor_id?: string;
  /** Events about one resource, for example `connection` and its id. */
  target_type?: string;
  target_id?: string;
  /** Exclusive upper bound on `occurred_at`, for paging backwards. */
  before?: Date;
  limit?: number;
}

/**
 * Append-only by construction (FR-SEC-31): the port has no update or delete,
 * so no caller can rewrite history. The database role restriction (INSERT and
 * SELECT only) is the matching infrastructure control and arrives with the
 * hash chain.
 */
export interface AuditEventRepository {
  insert(record: NewAuditEventRecord): Promise<AuditEventEntity>;
  select(query: AuditEventQuery): Promise<AuditEventEntity[]>;
}
