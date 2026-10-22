import 'server-only';
import type { Prisma, PrismaClient } from '@/server/infrastructure/database/generated/client';
import type {
  ApprovalEntity,
  ApprovalRevisionEntity,
  InboxItemEntity,
  InboxTab,
  InputField,
  InputRequestEntity,
} from '@/server/domain/inbox/inbox_item';
import type {
  AppendRevisionInput,
  ClaimInput,
  CommitApprovalInput,
  CommitInputInput,
  ExpirableRows,
  InboxBundle,
  InboxCounts,
  InboxListQuery,
  InboxListResult,
  InboxRepository,
  NewApprovalRecord,
  NewInputRecord,
  NewResultRecord,
} from '@/server/domain/repositories/inbox_repository';
import { activeClient } from './prisma_transaction_runner';

type Db = Prisma.TransactionClient;
type ItemRow = Awaited<ReturnType<Db['inboxItem']['findFirstOrThrow']>>;
type ApprovalRow = Awaited<ReturnType<Db['approval']['findFirstOrThrow']>>;
type InputRow = Awaited<ReturnType<Db['inputRequest']['findFirstOrThrow']>>;
type RevisionRow = Awaited<ReturnType<Db['approvalRevision']['findFirstOrThrow']>>;
type ItemWithChildren = ItemRow & { approval: ApprovalRow | null; input_request: InputRow | null };

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const record = (v: unknown): Record<string, unknown> => (v ?? {}) as Record<string, unknown>;

function mapItem(row: ItemRow, approvalId: string | null, inputId: string | null): InboxItemEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    recipient_user_id: row.recipient_user_id,
    kind: row.kind as InboxItemEntity['kind'],
    state: row.state as InboxItemEntity['state'],
    agent_slug: row.agent_slug,
    title: row.title,
    summary_key: row.summary_key,
    summary_params: record(row.summary_params),
    source_type: row.source_type as InboxItemEntity['source_type'],
    source_id: row.source_id,
    approval_id: approvalId,
    input_request_id: inputId,
    dedupe_key: row.dedupe_key,
    expires_at: iso(row.expires_at),
    resolved_at: iso(row.resolved_at),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function mapApproval(row: ApprovalRow, names: Map<string, string>): ApprovalEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    inbox_item_id: row.inbox_item_id,
    agent_slug: row.agent_slug,
    source_type: row.source_type as ApprovalEntity['source_type'],
    source_id: row.source_id,
    run_id: row.run_id,
    upstream_approval_id: row.upstream_approval_id,
    action_type: row.action_type,
    payload: record(row.payload),
    payload_hash: row.payload_hash,
    risk_level: row.risk_level as ApprovalEntity['risk_level'],
    requirement: row.requirement as ApprovalEntity['requirement'],
    guardrail_reason: row.guardrail_reason,
    status: row.status as ApprovalEntity['status'],
    revision: row.revision,
    version: row.version,
    awaiting_revision: row.awaiting_revision,
    change_request: row.change_request,
    claimed_by: row.claimed_by,
    claimed_decision: row.claimed_decision as ApprovalEntity['claimed_decision'],
    claimed_at: iso(row.claimed_at),
    decided_by: row.decided_by,
    decided_by_name: row.decided_by ? (names.get(row.decided_by) ?? null) : null,
    decided_at: iso(row.decided_at),
    decision_note: row.decision_note,
    resume_delivered_at: iso(row.resume_delivered_at),
    expires_at: row.expires_at.toISOString(),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function mapInput(row: InputRow): InputRequestEntity {
  const schema = record(row.form_schema) as { fields?: InputField[] };
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    inbox_item_id: row.inbox_item_id,
    agent_slug: row.agent_slug,
    source_id: row.source_id,
    run_id: row.run_id,
    upstream_request_id: row.upstream_request_id,
    question: row.question,
    fields: schema.fields ?? [],
    answer: row.answer === null ? null : record(row.answer),
    status: row.status as InputRequestEntity['status'],
    version: row.version,
    claimed_by: row.claimed_by,
    claimed_at: iso(row.claimed_at),
    answered_by: row.answered_by,
    answered_at: iso(row.answered_at),
    resume_delivered_at: iso(row.resume_delivered_at),
    due_at: iso(row.due_at),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function mapRevision(row: RevisionRow): ApprovalRevisionEntity {
  return {
    id: row.id,
    approval_id: row.approval_id,
    revision: row.revision,
    payload: record(row.payload),
    payload_hash: row.payload_hash,
    created_by: row.created_by as ApprovalRevisionEntity['created_by'],
    created_by_user_id: row.created_by_user_id,
    note: row.note,
    created_at: row.created_at.toISOString(),
  };
}

const TAB_WHERE: Record<InboxTab, Prisma.InboxItemWhereInput> = {
  needs_review: { kind: 'approval', state: 'open' },
  needs_input: { kind: 'input_request', state: 'open' },
  done: { OR: [{ state: { not: 'open' } }, { kind: 'result' }] },
};

function encodeCursor(row: { created_at: Date; id: string }): string {
  return Buffer.from(`${row.created_at.toISOString()}|${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { created_at: Date; id: string } | null {
  const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const date = new Date(at ?? '');
  return id && !Number.isNaN(date.getTime()) ? { created_at: date, id } : null;
}

/**
 * Inbox persistence (ADR-0032). Every method reads its client through
 * `activeClient`, so a write inside a `TransactionRunner` scope commits or
 * rolls back with the audit row next to it. The conditional writers use
 * `updateMany` with the expected state in the WHERE: the row count is the
 * answer to "did I win", and no read-then-write race can pass it.
 */
export class PrismaInboxRepository implements InboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db(): Db {
    return activeClient(this.prisma);
  }

  private async names(ids: Array<string | null>): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (wanted.length === 0) return new Map();
    const users = await this.db.user.findMany({
      where: { id: { in: wanted } },
      select: { id: true, full_name: true, preferred_name: true },
    });
    return new Map(users.map((u) => [u.id, u.preferred_name?.trim() || u.full_name]));
  }

  private async toBundle(row: ItemWithChildren): Promise<InboxBundle> {
    const names = await this.names([row.approval?.decided_by ?? null]);
    return {
      item: mapItem(row, row.approval?.id ?? null, row.input_request?.id ?? null),
      approval: row.approval ? mapApproval(row.approval, names) : null,
      input_request: row.input_request ? mapInput(row.input_request) : null,
    };
  }

  private async loadByDedupe(workspaceId: string, dedupeKey: string): Promise<InboxBundle> {
    const row = await this.db.inboxItem.findFirstOrThrow({
      where: { workspace_id: workspaceId, dedupe_key: dedupeKey },
      include: { approval: true, input_request: true },
    });
    return this.toBundle(row);
  }

  /**
   * INSERT ... ON CONFLICT DO NOTHING, not create-and-catch-P2002: a unique
   * violation would abort the surrounding Postgres transaction, and the
   * creation runs inside one. A losing concurrent insert waits for the
   * winner's transaction and then sees the finished bundle.
   */
  private async insertItem(
    base: NewResultRecord,
    kind: string,
    state: string,
    expiresAt: Date | null,
  ): Promise<boolean> {
    const result = await this.db.inboxItem.createMany({
      data: [
        {
          workspace_id: base.workspace_id,
          recipient_user_id: base.recipient_user_id,
          kind,
          state,
          agent_slug: base.agent_slug,
          title: base.title,
          summary_key: base.summary_key,
          summary_params: base.summary_params as Prisma.InputJsonValue,
          source_type: base.source_type,
          source_id: base.source_id,
          dedupe_key: base.dedupe_key,
          expires_at: expiresAt,
          resolved_at: state === 'open' ? null : new Date(),
        },
      ],
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  async createApprovalItem(input: NewApprovalRecord) {
    const created = await this.insertItem(input, 'approval', 'open', input.expires_at);
    if (created) {
      const item = await this.db.inboxItem.findFirstOrThrow({
        where: { workspace_id: input.workspace_id, dedupe_key: input.dedupe_key },
      });
      await this.db.approval.create({
        data: {
          workspace_id: input.workspace_id,
          inbox_item_id: item.id,
          agent_slug: input.agent_slug,
          source_type: input.source_type,
          source_id: input.source_id,
          run_id: input.upstream_run_id,
          upstream_approval_id: input.upstream_approval_id,
          action_type: input.action_type,
          payload: input.payload as Prisma.InputJsonValue,
          payload_hash: input.payload_hash,
          risk_level: input.risk_level,
          requirement: input.requirement,
          guardrail_reason: input.guardrail_reason,
          expires_at: input.expires_at,
          revisions: {
            create: {
              revision: 1,
              payload: input.payload as Prisma.InputJsonValue,
              payload_hash: input.payload_hash,
              created_by: 'specialist',
            },
          },
        },
      });
    }
    return { bundle: await this.loadByDedupe(input.workspace_id, input.dedupe_key), created };
  }

  async createInputItem(input: NewInputRecord) {
    const created = await this.insertItem(input, 'input_request', 'open', input.due_at);
    if (created) {
      const item = await this.db.inboxItem.findFirstOrThrow({
        where: { workspace_id: input.workspace_id, dedupe_key: input.dedupe_key },
      });
      await this.db.inputRequest.create({
        data: {
          workspace_id: input.workspace_id,
          inbox_item_id: item.id,
          agent_slug: input.agent_slug,
          source_id: input.source_id,
          run_id: input.upstream_run_id,
          upstream_request_id: input.upstream_request_id,
          question: input.question,
          form_schema: { fields: input.fields } as unknown as Prisma.InputJsonValue,
          due_at: input.due_at,
        },
      });
    }
    return { bundle: await this.loadByDedupe(input.workspace_id, input.dedupe_key), created };
  }

  async createResultItem(input: NewResultRecord) {
    const created = await this.insertItem(input, 'result', 'resolved', null);
    return { bundle: await this.loadByDedupe(input.workspace_id, input.dedupe_key), created };
  }

  async appendRevision(approvalId: string, input: AppendRevisionInput): Promise<boolean> {
    const updated = await this.db.approval.updateMany({
      where: { id: approvalId, status: 'pending', awaiting_revision: true, revision: input.expected_revision },
      data: {
        revision: { increment: 1 },
        version: { increment: 1 },
        payload: input.payload as Prisma.InputJsonValue,
        payload_hash: input.payload_hash,
        guardrail_reason: input.guardrail_reason,
        awaiting_revision: false,
        change_request: null,
        claimed_by: null,
        claimed_decision: null,
        claimed_at: null,
        resume_delivered_at: null,
        expires_at: input.expires_at,
      },
    });
    if (updated.count !== 1) return false;
    const row = await this.db.approval.findUniqueOrThrow({ where: { id: approvalId } });
    await this.db.approvalRevision.create({
      data: {
        approval_id: approvalId,
        revision: row.revision,
        payload: input.payload as Prisma.InputJsonValue,
        payload_hash: input.payload_hash,
        created_by: 'specialist',
      },
    });
    await this.db.inboxItem.update({
      where: { id: row.inbox_item_id },
      data: {
        title: input.title,
        summary_params: input.summary_params as Prisma.InputJsonValue,
        expires_at: input.expires_at,
      },
    });
    return true;
  }

  async listRevisions(approvalId: string): Promise<ApprovalRevisionEntity[]> {
    const rows = await this.db.approvalRevision.findMany({
      where: { approval_id: approvalId },
      orderBy: { revision: 'asc' },
    });
    return rows.map(mapRevision);
  }

  async findBundle(workspaceId: string, itemId: string): Promise<InboxBundle | null> {
    const row = await this.db.inboxItem.findFirst({
      where: { id: itemId, workspace_id: workspaceId },
      include: { approval: true, input_request: true },
    });
    return row ? this.toBundle(row) : null;
  }

  async findApproval(workspaceId: string, approvalId: string): Promise<ApprovalEntity | null> {
    const row = await this.db.approval.findFirst({ where: { id: approvalId, workspace_id: workspaceId } });
    return row ? mapApproval(row, await this.names([row.decided_by])) : null;
  }

  async findApprovalByUpstreamId(workspaceId: string, upstreamApprovalId: string): Promise<ApprovalEntity | null> {
    const row = await this.db.approval.findFirst({
      where: { workspace_id: workspaceId, upstream_approval_id: upstreamApprovalId },
    });
    return row ? mapApproval(row, await this.names([row.decided_by])) : null;
  }

  async list(query: InboxListQuery): Promise<InboxListResult> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const and: Prisma.InboxItemWhereInput[] = [];
    if (query.tab) and.push(TAB_WHERE[query.tab]);
    if (cursor) {
      and.push({
        OR: [
          { created_at: { lt: cursor.created_at } },
          { created_at: cursor.created_at, id: { lt: cursor.id } },
        ],
      });
    }
    const rows = await this.db.inboxItem.findMany({
      where: {
        // Always applied: there is no unscoped list.
        workspace_id: query.workspace_id,
        ...(query.agent_slug ? { agent_slug: query.agent_slug } : {}),
        ...(query.recipient_user_id ? { recipient_user_id: query.recipient_user_id } : {}),
        ...(and.length ? { AND: and } : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const ids = page.map((r) => r.id);
    const [approvals, inputs] = await Promise.all([
      this.db.approval.findMany({ where: { inbox_item_id: { in: ids } }, select: { id: true, inbox_item_id: true } }),
      this.db.inputRequest.findMany({ where: { inbox_item_id: { in: ids } }, select: { id: true, inbox_item_id: true } }),
    ]);
    const approvalOf = new Map(approvals.map((a) => [a.inbox_item_id, a.id]));
    const inputOf = new Map(inputs.map((i) => [i.inbox_item_id, i.id]));
    return {
      items: page.map((r) => mapItem(r, approvalOf.get(r.id) ?? null, inputOf.get(r.id) ?? null)),
      next_cursor: rows.length > query.limit ? encodeCursor(page[page.length - 1]) : null,
    };
  }

  async counts(workspaceId: string, userId: string, recipientUserId?: string): Promise<InboxCounts> {
    const scope: Prisma.InboxItemWhereInput = {
      workspace_id: workspaceId,
      ...(recipientUserId ? { recipient_user_id: recipientUserId } : {}),
    };
    const count = (tab: InboxTab, unread = false) =>
      this.db.inboxItem.count({
        where: { ...scope, AND: [TAB_WHERE[tab], ...(unread ? [{ reads: { none: { user_id: userId } } }] : [])] },
      });
    const [needs_review, needs_input, done, unread_needs_review, unread_needs_input] = await Promise.all([
      count('needs_review'),
      count('needs_input'),
      count('done'),
      count('needs_review', true),
      count('needs_input', true),
    ]);
    return { needs_review, needs_input, done, unread_needs_review, unread_needs_input };
  }

  async markRead(workspaceId: string, itemId: string, userId: string, now: Date): Promise<void> {
    const item = await this.db.inboxItem.findFirst({ where: { id: itemId, workspace_id: workspaceId }, select: { id: true } });
    if (!item) return;
    // DO NOTHING on a repeat: a second open must not move the first read time.
    await this.db.inboxItemRead.createMany({
      data: [{ inbox_item_id: itemId, user_id: userId, read_at: now }],
      skipDuplicates: true,
    });
  }

  async readItemIds(userId: string, itemIds: string[]): Promise<Set<string>> {
    if (itemIds.length === 0) return new Set();
    const rows = await this.db.inboxItemRead.findMany({
      where: { user_id: userId, inbox_item_id: { in: itemIds } },
      select: { inbox_item_id: true },
    });
    return new Set(rows.map((r) => r.inbox_item_id));
  }

  async claimApproval(approvalId: string, input: ClaimInput, now: Date): Promise<boolean> {
    const result = await this.db.approval.updateMany({
      where: {
        id: approvalId,
        status: 'pending',
        claimed_at: null,
        awaiting_revision: false,
        version: input.expected_version,
      },
      data: { claimed_by: input.user_id, claimed_decision: input.decision, claimed_at: now },
    });
    return result.count === 1;
  }

  async releaseApproval(approvalId: string, userId: string): Promise<void> {
    await this.db.approval.updateMany({
      where: { id: approvalId, status: 'pending', claimed_by: userId },
      data: { claimed_by: null, claimed_decision: null, claimed_at: null },
    });
  }

  async commitApproval(approvalId: string, input: CommitApprovalInput): Promise<boolean> {
    const terminal = input.status !== 'pending';
    const result = await this.db.approval.updateMany({
      where: { id: approvalId, status: 'pending', claimed_by: input.user_id, version: input.expected_version },
      data: {
        status: input.status,
        version: { increment: 1 },
        claimed_by: null,
        claimed_decision: null,
        claimed_at: null,
        decided_by: terminal ? input.user_id : null,
        decided_at: terminal ? input.now : null,
        ...(input.note !== null ? { decision_note: input.note } : {}),
        awaiting_revision: input.status === 'pending',
        change_request: input.status === 'pending' ? (input.change_request ?? null) : undefined,
        resume_delivered_at: input.now,
        ...(input.edited
          ? {
              payload: input.edited.payload as Prisma.InputJsonValue,
              payload_hash: input.edited.payload_hash,
              revision: { increment: 1 },
            }
          : {}),
      },
    });
    if (result.count !== 1) return false;

    const row = await this.db.approval.findUniqueOrThrow({ where: { id: approvalId } });
    if (input.edited) {
      await this.db.approvalRevision.create({
        data: {
          approval_id: approvalId,
          revision: row.revision,
          payload: input.edited.payload as Prisma.InputJsonValue,
          payload_hash: input.edited.payload_hash,
          created_by: 'user',
          created_by_user_id: input.user_id,
        },
      });
    }
    if (terminal) {
      await this.db.inboxItem.update({
        where: { id: row.inbox_item_id },
        data: { state: 'resolved', resolved_at: input.now },
      });
    }
    return true;
  }

  async findInputRequest(workspaceId: string, inputRequestId: string): Promise<InputRequestEntity | null> {
    const row = await this.db.inputRequest.findFirst({ where: { id: inputRequestId, workspace_id: workspaceId } });
    return row ? mapInput(row) : null;
  }

  async claimInputRequest(
    inputRequestId: string,
    input: { expected_version: number; user_id: string },
    now: Date,
  ): Promise<boolean> {
    const result = await this.db.inputRequest.updateMany({
      where: { id: inputRequestId, status: 'pending', claimed_at: null, version: input.expected_version },
      data: { claimed_by: input.user_id, claimed_at: now },
    });
    return result.count === 1;
  }

  async releaseInputRequest(inputRequestId: string, userId: string): Promise<void> {
    await this.db.inputRequest.updateMany({
      where: { id: inputRequestId, status: 'pending', claimed_by: userId },
      data: { claimed_by: null, claimed_at: null },
    });
  }

  async commitInputRequest(inputRequestId: string, input: CommitInputInput): Promise<boolean> {
    const result = await this.db.inputRequest.updateMany({
      where: { id: inputRequestId, status: 'pending', claimed_by: input.user_id, version: input.expected_version },
      data: {
        status: input.status,
        answer: (input.answer ?? undefined) as Prisma.InputJsonValue | undefined,
        answered_by: input.user_id,
        answered_at: input.now,
        claimed_by: null,
        claimed_at: null,
        version: { increment: 1 },
        resume_delivered_at: input.now,
      },
    });
    if (result.count !== 1) return false;
    const row = await this.db.inputRequest.findUniqueOrThrow({ where: { id: inputRequestId } });
    await this.db.inboxItem.update({
      where: { id: row.inbox_item_id },
      data: { state: input.status === 'dismissed' ? 'dismissed' : 'resolved', resolved_at: input.now },
    });
    return true;
  }

  async listExpirable(now: Date, limit: number): Promise<ExpirableRows> {
    const [approvals, inputs] = await Promise.all([
      this.db.approval.findMany({
        where: { status: 'pending', claimed_at: null, expires_at: { lte: now } },
        orderBy: { expires_at: 'asc' },
        take: limit,
      }),
      this.db.inputRequest.findMany({
        where: { status: 'pending', claimed_at: null, due_at: { lte: now } },
        orderBy: { due_at: 'asc' },
        take: limit,
      }),
    ]);
    return {
      approvals: approvals.map((r) => mapApproval(r, new Map())),
      input_requests: inputs.map(mapInput),
    };
  }

  async expireApproval(approvalId: string, now: Date): Promise<boolean> {
    const result = await this.db.approval.updateMany({
      where: { id: approvalId, status: 'pending', claimed_at: null },
      data: { status: 'expired', version: { increment: 1 }, decided_at: now },
    });
    if (result.count !== 1) return false;
    const row = await this.db.approval.findUniqueOrThrow({ where: { id: approvalId } });
    await this.db.inboxItem.update({
      where: { id: row.inbox_item_id },
      data: { state: 'expired', resolved_at: now },
    });
    return true;
  }

  async expireInputRequest(inputRequestId: string, now: Date): Promise<boolean> {
    const result = await this.db.inputRequest.updateMany({
      where: { id: inputRequestId, status: 'pending', claimed_at: null },
      data: { status: 'expired', version: { increment: 1 } },
    });
    if (result.count !== 1) return false;
    const row = await this.db.inputRequest.findUniqueOrThrow({ where: { id: inputRequestId } });
    await this.db.inboxItem.update({
      where: { id: row.inbox_item_id },
      data: { state: 'expired', resolved_at: now },
    });
    return true;
  }

  async listUndeliveredExpired(limit: number): Promise<ExpirableRows> {
    const [approvals, inputs] = await Promise.all([
      this.db.approval.findMany({
        where: { status: 'expired', resume_delivered_at: null },
        orderBy: { decided_at: 'asc' },
        take: limit,
      }),
      this.db.inputRequest.findMany({
        where: { status: 'expired', resume_delivered_at: null },
        orderBy: { updated_at: 'asc' },
        take: limit,
      }),
    ]);
    return {
      approvals: approvals.map((r) => mapApproval(r, new Map())),
      input_requests: inputs.map(mapInput),
    };
  }

  async markResumeDelivered(target: 'approval' | 'input_request', id: string, at: Date): Promise<void> {
    if (target === 'approval') {
      await this.db.approval.updateMany({ where: { id }, data: { resume_delivered_at: at } });
    } else {
      await this.db.inputRequest.updateMany({ where: { id }, data: { resume_delivered_at: at } });
    }
  }

  async releaseStaleClaims(olderThan: Date): Promise<number> {
    const [approvals, inputs] = await Promise.all([
      this.db.approval.updateMany({
        where: { status: 'pending', claimed_at: { lt: olderThan } },
        data: { claimed_by: null, claimed_decision: null, claimed_at: null },
      }),
      this.db.inputRequest.updateMany({
        where: { status: 'pending', claimed_at: { lt: olderThan } },
        data: { claimed_by: null, claimed_at: null },
      }),
    ]);
    return approvals.count + inputs.count;
  }

  async listReminderDue(now: Date, leadMs: number, limit: number): Promise<ApprovalEntity[]> {
    const rows = await this.db.approval.findMany({
      where: { status: 'pending', expires_at: { gt: now, lte: new Date(now.getTime() + leadMs) } },
      orderBy: { expires_at: 'asc' },
      take: limit,
    });
    return rows.map((r) => mapApproval(r, new Map()));
  }
}
