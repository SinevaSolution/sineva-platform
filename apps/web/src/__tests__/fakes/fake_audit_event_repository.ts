import type { AuditEventEntity, NewAuditEventRecord } from '@/server/domain/audit/audit_event';
import type {
  AuditEventQuery,
  AuditEventRepository,
} from '@/server/domain/repositories/audit_event_repository';

// Mirrors the append-only port: no update or delete exists to call.
export class FakeAuditEventRepository implements AuditEventRepository {
  readonly rows: AuditEventEntity[] = [];
  failWith: Error | null = null;

  async insert(record: NewAuditEventRecord): Promise<AuditEventEntity> {
    if (this.failWith) {
      throw this.failWith;
    }
    const entity: AuditEventEntity = {
      ...record,
      id: `00000000-0000-4000-8000-${String(this.rows.length + 1).padStart(12, '0')}`,
      occurred_at: (record.occurred_at ?? new Date()).toISOString(),
      prev_hash: null,
      hash: null,
    };
    this.rows.push(entity);
    return entity;
  }

  async select(query: AuditEventQuery): Promise<AuditEventEntity[]> {
    return this.rows
      .filter((row) => row.workspace_id === query.workspace_id)
      .filter((row) => !query.action || row.action === query.action)
      .filter((row) => !query.target_type || row.target_type === query.target_type)
      .filter((row) => !query.target_id || row.target_id === query.target_id)
      .filter((row) => !query.actor_id || row.actor_id === query.actor_id)
      .filter((row) => !query.before || new Date(row.occurred_at).getTime() < query.before.getTime())
      // Newest first, like the database; rows written in the same millisecond keep insertion order reversed.
      .map((row, index) => ({ row, index }))
      .sort((a, b) => new Date(b.row.occurred_at).getTime() - new Date(a.row.occurred_at).getTime() || b.index - a.index)
      .map(({ row }) => row)
      .slice(0, query.limit ?? 50);
  }
}
