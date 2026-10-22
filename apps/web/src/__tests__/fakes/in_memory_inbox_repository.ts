import type {
  ApprovalEntity,
  ApprovalRevisionEntity,
  InboxItemEntity,
  InputRequestEntity,
  InboxTab,
} from '@/server/domain/inbox/inbox_item';
import { tabOf } from '@/server/domain/inbox/inbox_item';
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
import type { FakeTransactionRunner } from './fake_transaction_runner';

let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
const iso = (d: Date) => d.toISOString();

/**
 * Mirrors the conditional-write semantics of the Prisma adapter (the claim,
 * commit and expire calls only win from the right state), so use case tests
 * exercise first-writer-wins without a database.
 */
export class InMemoryInboxRepository implements InboxRepository {
  items = new Map<string, InboxItemEntity>();
  approvals = new Map<string, ApprovalEntity>();
  inputs = new Map<string, InputRequestEntity>();
  revisions: ApprovalRevisionEntity[] = [];
  reads = new Set<string>();
  names = new Map<string, string>();
  /** Set to make `commitApproval` / `commitInputRequest` throw, to test rollback. */
  commitFailure: Error | null = null;
  now = () => new Date();

  constructor(private readonly tx?: FakeTransactionRunner) {}

  private bundleOf(item: InboxItemEntity): InboxBundle {
    return {
      item,
      approval: [...this.approvals.values()].find((a) => a.inbox_item_id === item.id) ?? null,
      input_request: [...this.inputs.values()].find((i) => i.inbox_item_id === item.id) ?? null,
    };
  }

  private existing(workspaceId: string, dedupeKey: string): InboxBundle | null {
    const item = [...this.items.values()].find(
      (i) => i.workspace_id === workspaceId && i.dedupe_key === dedupeKey,
    );
    return item ? this.bundleOf(item) : null;
  }

  private newItem(
    input: NewResultRecord,
    kind: InboxItemEntity['kind'],
    state: InboxItemEntity['state'],
    expiresAt: Date | null,
  ): InboxItemEntity {
    const at = iso(this.now());
    const item: InboxItemEntity = {
      id: uuid(),
      workspace_id: input.workspace_id,
      recipient_user_id: input.recipient_user_id,
      kind,
      state,
      agent_slug: input.agent_slug,
      title: input.title,
      summary_key: input.summary_key,
      summary_params: input.summary_params,
      source_type: input.source_type,
      source_id: input.source_id,
      approval_id: null,
      input_request_id: null,
      dedupe_key: input.dedupe_key,
      expires_at: expiresAt ? iso(expiresAt) : null,
      resolved_at: state === 'open' ? null : at,
      created_at: at,
      updated_at: at,
    };
    this.items.set(item.id, item);
    return item;
  }

  async createApprovalItem(input: NewApprovalRecord) {
    const hit = this.existing(input.workspace_id, input.dedupe_key);
    if (hit) return { bundle: hit, created: false };
    const item = this.newItem(input, 'approval', 'open', input.expires_at);
    const at = iso(this.now());
    const approval: ApprovalEntity = {
      id: uuid(),
      workspace_id: input.workspace_id,
      inbox_item_id: item.id,
      agent_slug: input.agent_slug,
      source_type: input.source_type,
      source_id: input.source_id,
      run_id: input.upstream_run_id,
      upstream_approval_id: input.upstream_approval_id,
      action_type: input.action_type,
      payload: input.payload,
      payload_hash: input.payload_hash,
      risk_level: input.risk_level,
      requirement: input.requirement,
      guardrail_reason: input.guardrail_reason,
      status: 'pending',
      revision: 1,
      version: 1,
      awaiting_revision: false,
      change_request: null,
      claimed_by: null,
      claimed_decision: null,
      claimed_at: null,
      decided_by: null,
      decided_by_name: null,
      decided_at: null,
      decision_note: null,
      resume_delivered_at: null,
      expires_at: iso(input.expires_at),
      created_at: at,
      updated_at: at,
    };
    this.approvals.set(approval.id, approval);
    this.revisions.push({
      id: uuid(),
      approval_id: approval.id,
      revision: 1,
      payload: input.payload,
      payload_hash: input.payload_hash,
      created_by: 'specialist',
      created_by_user_id: null,
      note: null,
      created_at: at,
    });
    return { bundle: this.bundleOf(item), created: true };
  }

  async createInputItem(input: NewInputRecord) {
    const hit = this.existing(input.workspace_id, input.dedupe_key);
    if (hit) return { bundle: hit, created: false };
    const item = this.newItem(input, 'input_request', 'open', input.due_at);
    const at = iso(this.now());
    const request: InputRequestEntity = {
      id: uuid(),
      workspace_id: input.workspace_id,
      inbox_item_id: item.id,
      agent_slug: input.agent_slug,
      source_id: input.source_id,
      run_id: input.upstream_run_id,
      upstream_request_id: input.upstream_request_id,
      question: input.question,
      fields: input.fields,
      answer: null,
      status: 'pending',
      version: 1,
      claimed_by: null,
      claimed_at: null,
      answered_by: null,
      answered_at: null,
      resume_delivered_at: null,
      due_at: input.due_at ? iso(input.due_at) : null,
      created_at: at,
      updated_at: at,
    };
    this.inputs.set(request.id, request);
    return { bundle: this.bundleOf(item), created: true };
  }

  async createResultItem(input: NewResultRecord) {
    const hit = this.existing(input.workspace_id, input.dedupe_key);
    if (hit) return { bundle: hit, created: false };
    return { bundle: this.bundleOf(this.newItem(input, 'result', 'resolved', null)), created: true };
  }

  async appendRevision(approvalId: string, input: AppendRevisionInput) {
    const a = this.approvals.get(approvalId);
    if (!a || a.status !== 'pending' || !a.awaiting_revision || a.revision !== input.expected_revision) {
      return false;
    }
    this.approvals.set(a.id, {
      ...a,
      revision: a.revision + 1,
      payload: input.payload,
      payload_hash: input.payload_hash,
      guardrail_reason: input.guardrail_reason,
      awaiting_revision: false,
      change_request: null,
      claimed_by: null,
      claimed_decision: null,
      claimed_at: null,
      resume_delivered_at: null,
      version: a.version + 1,
      expires_at: iso(input.expires_at),
    });
    this.revisions.push({
      id: uuid(),
      approval_id: a.id,
      revision: a.revision + 1,
      payload: input.payload,
      payload_hash: input.payload_hash,
      created_by: 'specialist',
      created_by_user_id: null,
      note: null,
      created_at: iso(this.now()),
    });
    const item = this.items.get(a.inbox_item_id)!;
    this.items.set(item.id, {
      ...item,
      title: input.title,
      summary_params: input.summary_params,
      expires_at: iso(input.expires_at),
    });
    return true;
  }

  async listRevisions(approvalId: string) {
    return this.revisions.filter((r) => r.approval_id === approvalId).sort((a, b) => a.revision - b.revision);
  }

  private withName(a: ApprovalEntity): ApprovalEntity {
    return { ...a, decided_by_name: a.decided_by ? (this.names.get(a.decided_by) ?? null) : null };
  }

  async findBundle(workspaceId: string, itemId: string) {
    const item = this.items.get(itemId);
    if (!item || item.workspace_id !== workspaceId) return null;
    const b = this.bundleOf(item);
    return { ...b, approval: b.approval ? this.withName(b.approval) : null };
  }

  async findApproval(workspaceId: string, approvalId: string) {
    const a = this.approvals.get(approvalId);
    return a && a.workspace_id === workspaceId ? this.withName(a) : null;
  }

  async findApprovalByUpstreamId(workspaceId: string, upstreamId: string) {
    const a = [...this.approvals.values()].find(
      (x) => x.workspace_id === workspaceId && x.upstream_approval_id === upstreamId,
    );
    return a ? this.withName(a) : null;
  }

  async list(query: InboxListQuery): Promise<InboxListResult> {
    const rows = [...this.items.values()]
      .filter((i) => i.workspace_id === query.workspace_id)
      .filter((i) => !query.recipient_user_id || i.recipient_user_id === query.recipient_user_id)
      .filter((i) => !query.agent_slug || i.agent_slug === query.agent_slug)
      .filter((i) => !query.tab || tabOf(i) === query.tab)
      .sort((a, b) => (a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1));
    const start = query.cursor ? rows.findIndex((r) => r.id === query.cursor) + 1 : 0;
    const page = rows.slice(start, start + query.limit);
    const more = start + query.limit < rows.length;
    return { items: page, next_cursor: more ? page[page.length - 1].id : null };
  }

  async counts(workspaceId: string, userId: string, recipientUserId?: string): Promise<InboxCounts> {
    const rows = [...this.items.values()].filter(
      (i) => i.workspace_id === workspaceId && (!recipientUserId || i.recipient_user_id === recipientUserId),
    );
    const tab = (t: InboxTab) => rows.filter((i) => tabOf(i) === t);
    const unread = (t: InboxTab) => tab(t).filter((i) => !this.reads.has(`${i.id}:${userId}`)).length;
    return {
      needs_review: tab('needs_review').length,
      needs_input: tab('needs_input').length,
      done: tab('done').length,
      unread_needs_review: unread('needs_review'),
      unread_needs_input: unread('needs_input'),
    };
  }

  async markRead(workspaceId: string, itemId: string, userId: string) {
    const item = this.items.get(itemId);
    if (item && item.workspace_id === workspaceId) this.reads.add(`${itemId}:${userId}`);
  }

  async readItemIds(userId: string, itemIds: string[]) {
    return new Set(itemIds.filter((id) => this.reads.has(`${id}:${userId}`)));
  }

  async claimApproval(id: string, input: ClaimInput, now: Date) {
    const a = this.approvals.get(id);
    if (!a || a.status !== 'pending' || a.claimed_at || a.awaiting_revision || a.version !== input.expected_version) {
      return false;
    }
    this.approvals.set(id, {
      ...a,
      claimed_by: input.user_id,
      claimed_decision: input.decision,
      claimed_at: iso(now),
    });
    return true;
  }

  async releaseApproval(id: string, userId: string) {
    const a = this.approvals.get(id);
    if (a && a.claimed_by === userId && a.status === 'pending') {
      this.approvals.set(id, { ...a, claimed_by: null, claimed_decision: null, claimed_at: null });
    }
  }

  async commitApproval(id: string, input: CommitApprovalInput) {
    if (this.commitFailure) throw this.commitFailure;
    const a = this.approvals.get(id);
    if (!a || a.status !== 'pending' || a.claimed_by !== input.user_id || a.version !== input.expected_version) {
      return false;
    }
    const before = { ...a };
    const terminal = input.status !== 'pending';
    const next: ApprovalEntity = {
      ...a,
      status: input.status,
      version: a.version + 1,
      claimed_by: null,
      claimed_decision: null,
      claimed_at: null,
      decided_by: terminal ? input.user_id : null,
      decided_at: terminal ? iso(input.now) : null,
      decision_note: input.note ?? a.decision_note,
      awaiting_revision: input.status === 'pending',
      change_request: input.status === 'pending' ? (input.change_request ?? null) : a.change_request,
      resume_delivered_at: iso(input.now),
      payload: input.edited?.payload ?? a.payload,
      payload_hash: input.edited?.payload_hash ?? a.payload_hash,
      revision: input.edited ? a.revision + 1 : a.revision,
    };
    this.approvals.set(id, next);
    if (input.edited) {
      this.revisions.push({
        id: uuid(),
        approval_id: id,
        revision: next.revision,
        payload: input.edited.payload,
        payload_hash: input.edited.payload_hash,
        created_by: 'user',
        created_by_user_id: input.user_id,
        note: null,
        created_at: iso(input.now),
      });
    }
    const item = this.items.get(a.inbox_item_id)!;
    const beforeItem = { ...item };
    if (terminal) {
      this.items.set(item.id, { ...item, state: 'resolved', resolved_at: iso(input.now) });
    }
    this.tx?.onRollback(() => {
      this.approvals.set(id, before);
      this.items.set(item.id, beforeItem);
    });
    return true;
  }

  async findInputRequest(workspaceId: string, id: string) {
    const r = this.inputs.get(id);
    return r && r.workspace_id === workspaceId ? r : null;
  }

  async claimInputRequest(id: string, input: { expected_version: number; user_id: string }, now: Date) {
    const r = this.inputs.get(id);
    if (!r || r.status !== 'pending' || r.claimed_at || r.version !== input.expected_version) return false;
    this.inputs.set(id, { ...r, claimed_by: input.user_id, claimed_at: iso(now) });
    return true;
  }

  async releaseInputRequest(id: string, userId: string) {
    const r = this.inputs.get(id);
    if (r && r.claimed_by === userId && r.status === 'pending') {
      this.inputs.set(id, { ...r, claimed_by: null, claimed_at: null });
    }
  }

  async commitInputRequest(id: string, input: CommitInputInput) {
    if (this.commitFailure) throw this.commitFailure;
    const r = this.inputs.get(id);
    if (!r || r.status !== 'pending' || r.claimed_by !== input.user_id || r.version !== input.expected_version) {
      return false;
    }
    const before = { ...r };
    this.inputs.set(id, {
      ...r,
      status: input.status,
      answer: input.answer,
      answered_by: input.user_id,
      answered_at: iso(input.now),
      claimed_by: null,
      claimed_at: null,
      version: r.version + 1,
      resume_delivered_at: iso(input.now),
    });
    const item = this.items.get(r.inbox_item_id)!;
    const beforeItem = { ...item };
    this.items.set(item.id, {
      ...item,
      state: input.status === 'dismissed' ? 'dismissed' : 'resolved',
      resolved_at: iso(input.now),
    });
    this.tx?.onRollback(() => {
      this.inputs.set(id, before);
      this.items.set(item.id, beforeItem);
    });
    return true;
  }

  async listExpirable(now: Date, limit: number): Promise<ExpirableRows> {
    return {
      approvals: [...this.approvals.values()]
        .filter((a) => a.status === 'pending' && !a.claimed_at && Date.parse(a.expires_at) <= now.getTime())
        .slice(0, limit),
      input_requests: [...this.inputs.values()]
        .filter((r) => r.status === 'pending' && !r.claimed_at && r.due_at && Date.parse(r.due_at) <= now.getTime())
        .slice(0, limit),
    };
  }

  async expireApproval(id: string, now: Date) {
    const a = this.approvals.get(id);
    if (!a || a.status !== 'pending' || a.claimed_at) return false;
    this.approvals.set(id, { ...a, status: 'expired', version: a.version + 1, decided_at: iso(now) });
    const item = this.items.get(a.inbox_item_id)!;
    this.items.set(item.id, { ...item, state: 'expired', resolved_at: iso(now) });
    return true;
  }

  async expireInputRequest(id: string, now: Date) {
    const r = this.inputs.get(id);
    if (!r || r.status !== 'pending' || r.claimed_at) return false;
    this.inputs.set(id, { ...r, status: 'expired', version: r.version + 1 });
    const item = this.items.get(r.inbox_item_id)!;
    this.items.set(item.id, { ...item, state: 'expired', resolved_at: iso(now) });
    return true;
  }

  async listUndeliveredExpired(limit: number): Promise<ExpirableRows> {
    return {
      approvals: [...this.approvals.values()]
        .filter((a) => a.status === 'expired' && !a.resume_delivered_at)
        .slice(0, limit),
      input_requests: [...this.inputs.values()]
        .filter((r) => r.status === 'expired' && !r.resume_delivered_at)
        .slice(0, limit),
    };
  }

  async markResumeDelivered(target: 'approval' | 'input_request', id: string, at: Date) {
    if (target === 'approval') {
      const a = this.approvals.get(id);
      if (a) this.approvals.set(id, { ...a, resume_delivered_at: iso(at) });
    } else {
      const r = this.inputs.get(id);
      if (r) this.inputs.set(id, { ...r, resume_delivered_at: iso(at) });
    }
  }

  async releaseStaleClaims(olderThan: Date) {
    let n = 0;
    for (const [id, a] of this.approvals) {
      if (a.status === 'pending' && a.claimed_at && Date.parse(a.claimed_at) < olderThan.getTime()) {
        this.approvals.set(id, { ...a, claimed_by: null, claimed_decision: null, claimed_at: null });
        n++;
      }
    }
    for (const [id, r] of this.inputs) {
      if (r.status === 'pending' && r.claimed_at && Date.parse(r.claimed_at) < olderThan.getTime()) {
        this.inputs.set(id, { ...r, claimed_by: null, claimed_at: null });
        n++;
      }
    }
    return n;
  }

  async listReminderDue(now: Date, leadMs: number, limit: number) {
    return [...this.approvals.values()]
      .filter(
        (a) =>
          a.status === 'pending' &&
          Date.parse(a.expires_at) > now.getTime() &&
          Date.parse(a.expires_at) <= now.getTime() + leadMs,
      )
      .slice(0, limit);
  }
}
