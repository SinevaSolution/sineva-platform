import 'server-only';
import type { AuditEventEntity, NewAuditEventRecord } from '@/server/domain/audit/audit_event';
import type {
  AuditEventQuery,
  AuditEventRepository,
} from '@/server/domain/repositories/audit_event_repository';
import type { Prisma, PrismaClient } from './generated/client';
import { activeClient } from './prisma_transaction_runner';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type Row = Awaited<ReturnType<Prisma.TransactionClient['auditEvent']['create']>>;

function mapRow(row: Row): AuditEventEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    occurred_at: row.occurred_at.toISOString(),
    actor_type: row.actor_type as AuditEventEntity['actor_type'],
    actor_id: row.actor_id,
    on_behalf_of_user_id: row.on_behalf_of_user_id,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id,
    outcome: row.outcome as AuditEventEntity['outcome'],
    reason_code: row.reason_code,
    request_id: row.request_id,
    run_id: row.run_id,
    ip: row.ip,
    user_agent: row.user_agent,
    change: row.change as AuditEventEntity['change'],
    metadata: row.metadata as AuditEventEntity['metadata'],
    prev_hash: row.prev_hash,
    hash: row.hash,
  };
}

// Insert and select only. The class deliberately has no update, delete or
// upsert, and a test pins that; the matching database role (INSERT and SELECT
// only) is an infrastructure task that arrives with the hash chain.
export class PrismaAuditRepository implements AuditEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(record: NewAuditEventRecord): Promise<AuditEventEntity> {
    // `activeClient` makes the row join the transaction of the action it
    // records, so a failed audit write rolls that action back.
    const row = await activeClient(this.prisma).auditEvent.create({
      data: {
        workspace_id: record.workspace_id,
        ...(record.occurred_at ? { occurred_at: record.occurred_at } : {}),
        actor_type: record.actor_type,
        actor_id: record.actor_id,
        on_behalf_of_user_id: record.on_behalf_of_user_id,
        action: record.action,
        target_type: record.target_type,
        target_id: record.target_id,
        outcome: record.outcome,
        reason_code: record.reason_code,
        request_id: record.request_id,
        run_id: record.run_id,
        ip: record.ip,
        user_agent: record.user_agent,
        change: (record.change ?? undefined) as Prisma.InputJsonValue | undefined,
        metadata: (record.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    return mapRow(row);
  }

  async select(query: AuditEventQuery): Promise<AuditEventEntity[]> {
    const rows = await activeClient(this.prisma).auditEvent.findMany({
      where: {
        // Required in the type and always applied: there is no unscoped read.
        workspace_id: query.workspace_id,
        ...(query.action ? { action: query.action } : {}),
        ...(query.actor_id ? { actor_id: query.actor_id } : {}),
        ...(query.before ? { occurred_at: { lt: query.before } } : {}),
      },
      orderBy: { occurred_at: 'desc' },
      take: Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
    });
    return rows.map(mapRow);
  }
}
