import { buildAuditRecord } from '@/server/domain/audit/audit_event';
import type { AuditEvent, AuditLogger } from '@/server/domain/audit/audit_logger';
import type { AuditEventRepository } from '@/server/domain/repositories/audit_event_repository';

// Persists each event through the append-only repository. It does not catch:
// a failed audit write must reject so the caller fails the privileged action
// instead of reporting success with no record. Inside a `TransactionRunner`
// scope the insert joins the action's transaction, so both commit or neither.
export class RepositoryAuditLogger implements AuditLogger {
  constructor(private readonly repository: AuditEventRepository) {}

  async log(event: AuditEvent): Promise<void> {
    await this.repository.insert(buildAuditRecord(event));
  }
}
