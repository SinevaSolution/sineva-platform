import { mask } from '@sineva/shared';
import { buildAuditRecord, type NewAuditEventRecord } from '@/server/domain/audit/audit_event';
import type { AuditEvent, AuditLogger } from '@/server/domain/audit/audit_logger';
import type { AuditEventRepository } from '@/server/domain/repositories/audit_event_repository';

// The domain redaction is by key name (a value under `token` is dropped), which
// cannot catch a credential a caller stores under an innocent key such as `note`
// or `upstream`. Masking the string leaves by shape is the second layer, with the
// same pattern list the logger uses (WP-M2-06). Ids, counts and names are not
// credential-shaped, so they pass through unchanged.
function maskDeep(value: unknown): unknown {
  if (typeof value === 'string') return mask(value);
  if (Array.isArray(value)) return value.map(maskDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, maskDeep(inner)]));
  }
  return value;
}

function maskRecord(record: NewAuditEventRecord): NewAuditEventRecord {
  return {
    ...record,
    change: record.change ? (maskDeep(record.change) as NewAuditEventRecord['change']) : null,
    metadata: record.metadata ? (maskDeep(record.metadata) as Record<string, unknown>) : null,
    reason_code: record.reason_code ? mask(record.reason_code) : null,
  };
}

// Persists each event through the append-only repository. It does not catch:
// a failed audit write must reject so the caller fails the privileged action
// instead of reporting success with no record. Inside a `TransactionRunner`
// scope the insert joins the action's transaction, so both commit or neither.
export class RepositoryAuditLogger implements AuditLogger {
  constructor(private readonly repository: AuditEventRepository) {}

  async log(event: AuditEvent): Promise<void> {
    await this.repository.insert(maskRecord(buildAuditRecord(event)));
  }
}
