import { beforeEach, describe, expect, it } from 'vitest';
import { CreateInboxItemUseCase } from '@/server/application/use-cases/inbox/create_inbox_item_use_case';
import { ApprovalDecisionService } from '@/server/application/use-cases/inbox/approval_decision_service';
import { DecideApprovalUseCase } from '@/server/application/use-cases/inbox/decide_approval_use_case';
import { RequestApprovalChangesUseCase } from '@/server/application/use-cases/inbox/request_approval_changes_use_case';
import { AnswerInputRequestUseCase } from '@/server/application/use-cases/inbox/answer_input_request_use_case';
import { DismissInboxItemUseCase } from '@/server/application/use-cases/inbox/dismiss_inbox_item_use_case';
import { ExpireInboxItemsUseCase } from '@/server/application/use-cases/inbox/expire_inbox_items_use_case';
import { GetInboxCountsUseCase } from '@/server/application/use-cases/inbox/get_inbox_counts_use_case';
import { GetInboxItemUseCase } from '@/server/application/use-cases/inbox/get_inbox_item_use_case';
import { ListInboxUseCase } from '@/server/application/use-cases/inbox/list_inbox_use_case';
import { MarkInboxItemReadUseCase } from '@/server/application/use-cases/inbox/mark_inbox_item_read_use_case';
import { CountingAuditLogger, type AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ContextSigner } from '@/server/domain/context/signed_context';
import { hashPayload } from '@/server/domain/approvals/action_types';
import {
  DomainError,
  UpstreamServiceError,
  UpstreamUnavailableError,
} from '@/server/domain/errors/domain_error';
import type { NewApprovalItem, NewInputRequestItem } from '@/server/domain/inbox/inbox_item_creator';
import { FakeAiEngineGateway } from './fakes/fake_ai_engine_gateway';
import { FakeTransactionRunner } from './fakes/fake_transaction_runner';
import { InMemoryInboxRepository } from './fakes/in_memory_inbox_repository';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000002';
const ALICE = 'aaaaaaaa-0000-4000-8000-000000000003';
const BOB = 'aaaaaaaa-0000-4000-8000-000000000004';
const VIEWER = 'aaaaaaaa-0000-4000-8000-000000000005';
const RINA = 'aaaaaaaa-0000-4000-8000-000000000006';
const HANDLE = 'run_0a1b2c3d-0000-4000-8000-000000000001';
const UP_RUN = '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e';
const UP_APPROVAL = '5d0c6a4e-7b1f-4c2a-9e83-0f6a2b1d4c77';
const UP_INPUT = '9a3e5f21-4b6c-4d8e-8f10-2c7b9d0e1a34';
const CONVERSATION = 'cccccccc-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-22T10:00:00.000Z');

const ctx = (user: string, role: RequestContext['role'], workspace = WS): RequestContext => ({
  user_id: user,
  workspace_id: workspace,
  role,
  session_id: `sess-${user}`,
  request_id: 'req-12345678',
  actor: { type: 'user', id: user },
});
const owner = ctx(OWNER, 'owner');
const admin = ctx(ADMIN, 'admin');
const alice = ctx(ALICE, 'member');
const bob = ctx(BOB, 'member');
const viewer = ctx(VIEWER, 'viewer');

const PAYLOAD = { draft_kind: 'post', title: 'Promo Jumat', body: 'Diskon 20% akhir pekan.' };

function approvalInput(over: Partial<NewApprovalItem['approval']> = {}, recipient: string | null = ALICE): NewApprovalItem {
  return {
    kind: 'approval',
    workspace_id: WS,
    recipient_user_id: recipient,
    agent_slug: 'sinosocial',
    title: 'Caption Instagram untuk promo akhir pekan',
    source: { type: 'chat', id: HANDLE },
    approval: {
      upstream_approval_id: UP_APPROVAL,
      upstream_run_id: UP_RUN,
      revision: 1,
      action_type: 'draft.review',
      payload: PAYLOAD,
      guardrail_reason: 'sinosocial_posts_stay_drafts',
      ...over,
    },
  };
}

const FIELDS = [
  { key: 'period', type: 'text' as const, label: 'Periode', required: true },
  { key: 'currency', type: 'choice' as const, label: 'Mata uang', required: true, choices: ['IDR', 'USD'] },
];

function inputInput(over: Partial<NewInputRequestItem['input']> = {}): NewInputRequestItem {
  return {
    kind: 'input_request',
    workspace_id: WS,
    recipient_user_id: ALICE,
    agent_slug: 'sinofinance',
    title: 'Periode mana?',
    source: { type: 'chat', id: HANDLE },
    input: {
      upstream_request_id: UP_INPUT,
      upstream_run_id: UP_RUN,
      question: 'Periode bulan mana yang mau direkonsiliasi?',
      fields: FIELDS,
      ...over,
    },
  };
}

function harness(auditOverride?: AuditLogger) {
  const transactions = new FakeTransactionRunner();
  const inbox = new InMemoryInboxRepository(transactions);
  inbox.names.set(RINA, 'Rina');
  inbox.names.set(OWNER, 'Rina');
  const audit = new CountingAuditLogger();
  const gateway = new FakeAiEngineGateway();
  const minted: Array<{ ctx: RequestContext; opts: unknown }> = [];
  const contextSigner: ContextSigner = {
    mint: async (c, opts) => {
      minted.push({ ctx: c, opts });
      return { token: 'ctx.token', claims: {} as never };
    },
  };
  const logged: string[] = [];
  const log = { failed: (step: string) => void logged.push(step) };
  const now = () => NOW;
  // Only the lookup the detail needs: a run handle of this workspace maps to a conversation.
  const chats = {
    findByHandle: async (handle: string) =>
      handle === HANDLE ? ({ workspace_id: WS, conversation_id: CONVERSATION } as never) : null,
  };
  const deps = {
    inbox,
    audit: auditOverride ?? audit,
    transactions,
    gateway,
    contextSigner,
    log,
    now,
  };
  return {
    inbox,
    audit,
    gateway,
    minted,
    logged,
    transactions,
    create: new CreateInboxItemUseCase(deps),
    decide: new DecideApprovalUseCase(deps),
    changes: new RequestApprovalChangesUseCase(deps),
    answer: new AnswerInputRequestUseCase(deps),
    dismiss: new DismissInboxItemUseCase(deps),
    expire: new ExpireInboxItemsUseCase(deps),
    list: new ListInboxUseCase(deps),
    get: new GetInboxItemUseCase({ ...deps, chats }),
    counts: new GetInboxCountsUseCase(deps),
    read: new MarkInboxItemReadUseCase(deps),
    deps,
  };
}

const systemCtx = (): RequestContext => ({
  user_id: 'system:internal',
  workspace_id: WS,
  session_id: 'internal',
  request_id: 'req-12345678',
  actor: { type: 'system', id: 'internal' },
});

async function seedApproval(h: ReturnType<typeof harness>, over: Partial<NewApprovalItem['approval']> = {}) {
  const created = await h.create.execute(approvalInput(over), systemCtx());
  return created.approval!;
}

async function expectCode(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected ${code}`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  expect((error as DomainError).status).toBe(status);
}

describe('creating items through the port (FR-INBOX-02, FR-INBOX-06)', () => {
  it('stores a draft.review approval with a platform-built sentence, 7 day expiry and an audit row', async () => {
    const h = harness();
    const result = await h.create.execute(approvalInput(), systemCtx());

    expect(result.created).toBe(true);
    expect(result.item).toMatchObject({
      kind: 'approval',
      state: 'open',
      recipient_user_id: ALICE,
      summary_key: 'inbox.sentence.draft_review',
      summary_params: { specialist_slug: 'sinosocial', draft_kind: 'post' },
      source_type: 'chat',
      source_id: HANDLE,
    });
    expect(result.approval).toMatchObject({
      status: 'pending',
      revision: 1,
      version: 1,
      action_type: 'draft.review',
      payload_hash: hashPayload(PAYLOAD),
      requirement: 'guardrail',
      expires_at: '2026-10-29T10:00:00.000Z',
    });
    expect(h.audit.getEvents().map((e) => e.action)).toEqual(['approval.requested']);
    expect(JSON.stringify(h.audit.getEvents())).not.toContain('Diskon 20%');
  });

  it('is idempotent on the upstream approval id: a replay returns the same item and audits once', async () => {
    const h = harness();
    const first = await h.create.execute(approvalInput(), systemCtx());
    const second = await h.create.execute(approvalInput(), systemCtx());
    expect(second.created).toBe(false);
    expect(second.item.id).toBe(first.item.id);
    expect(h.inbox.items.size).toBe(1);
    expect(h.audit.getEventCount()).toBe(1);
  });

  it('refuses an unregistered action type and an invalid payload with 422', async () => {
    const h = harness();
    await expectCode(h.create.execute(approvalInput({ action_type: 'email.send' }), systemCtx()), 'unsupported_action_type', 422);
    await expectCode(h.create.execute(approvalInput({ payload: { draft_kind: 'post' } }), systemCtx()), 'invalid_payload', 422);
    expect(h.inbox.items.size).toBe(0);
  });

  it('bounds expiry: a producer may ask for less, never past 30 days', async () => {
    const h = harness();
    const soon = new Date('2026-10-23T10:00:00.000Z');
    const a = await h.create.execute(approvalInput({ expires_at: soon }), systemCtx());
    expect(a.approval!.expires_at).toBe(soon.toISOString());
  });

  it('appends a specialist revision after a change request and ignores replays of it', async () => {
    const h = harness();
    const approval = await seedApproval(h);
    await h.changes.execute(approval.id, { version: 1, instruction: 'Lebih singkat' }, alice);

    const revised = { ...PAYLOAD, body: 'Diskon 20% Jumat sampai Minggu.' };
    const second = await h.create.execute(approvalInput({ revision: 2, payload: revised }), systemCtx());
    expect(second.created).toBe(false);
    expect(second.approval).toMatchObject({ revision: 2, awaiting_revision: false, status: 'pending', payload_hash: hashPayload(revised) });
    expect((await h.inbox.listRevisions(approval.id)).map((r) => r.revision)).toEqual([1, 2]);

    await h.create.execute(approvalInput({ revision: 2, payload: revised }), systemCtx());
    expect((await h.inbox.listRevisions(approval.id)).length).toBe(2);
    await expectCode(h.create.execute(approvalInput({ revision: 3, payload: revised }), systemCtx()), 'RESOURCE_CONFLICT', 409);
  });

  it('stores an input request and refuses a form with more than 8 fields', async () => {
    const h = harness();
    const ok = await h.create.execute(inputInput(), systemCtx());
    expect(ok.input_request).toMatchObject({ status: 'pending', question: 'Periode bulan mana yang mau direkonsiliasi?' });
    expect(ok.item.summary_key).toBe('inbox.sentence.input_request');
    expect(h.audit.getEvents().map((e) => e.action)).toEqual(['input.requested']);

    const many = Array.from({ length: 9 }, (_, i) => ({ key: `f${i}`, type: 'text' as const, label: 'x', required: false }));
    await expectCode(h.create.execute(inputInput({ upstream_request_id: 'other', fields: many }), systemCtx()), 'invalid_payload', 422);
  });

  it('stores a result item as resolved news for the Updates tab', async () => {
    const h = harness();
    const result = await h.create.execute(
      {
        kind: 'result',
        workspace_id: WS,
        recipient_user_id: ALICE,
        agent_slug: 'sinoinsights',
        title: 'Laporan mingguan siap',
        source: { type: 'chat', id: HANDLE },
        dedupe_key: 'result:1',
        summary_key: 'inbox.sentence.result',
        summary_params: {},
      },
      systemCtx(),
    );
    expect(result.item).toMatchObject({ kind: 'result', state: 'resolved' });
  });
});

describe('deciding an approval (FR-INBOX-08, FR-INBOX-11)', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it('approve marks the draft ready, tells the run, audits, and executes nothing', async () => {
    const approval = await seedApproval(h);
    const view = await h.decide.execute(approval.id, { decision: 'approve', version: 1 }, alice);

    expect(view.approval).toMatchObject({ status: 'approved', version: 2, decided_by: ALICE });
    expect(view.state).toBe('resolved');
    expect(h.gateway.resumeRequests).toHaveLength(1);
    expect(h.gateway.resumeRequests[0]).toMatchObject({
      runId: UP_RUN,
      idempotencyKey: `${approval.id}:1:approved`,
      body: {
        kind: 'approval',
        approval_id: UP_APPROVAL,
        revision: 1,
        decision: 'approved',
        edited: false,
        payload_hash: hashPayload(PAYLOAD),
        result: { executed: false },
      },
    });
    expect(h.audit.getEvents().map((e) => e.action)).toEqual(['approval.requested', 'approval.approved']);
  });

  it('mints the resume context as the run owner, not the decider', async () => {
    const approval = await seedApproval(h);
    await h.decide.execute(approval.id, { decision: 'approve', version: 1 }, admin);
    expect(h.minted.at(-1)!.ctx.user_id).toBe(ALICE);
    expect(h.minted.at(-1)!.opts).toMatchObject({ agent_slug: 'sinosocial', run_id: HANDLE });
  });

  it('reject stores the optional note, sends it to the run and audits', async () => {
    const approval = await seedApproval(h);
    const view = await h.decide.execute(approval.id, { decision: 'reject', version: 1, note: 'Terlalu santai' }, alice);
    expect(view.approval).toMatchObject({ status: 'rejected', decision_note: 'Terlalu santai' });
    expect(h.gateway.resumeRequests[0].body).toMatchObject({ decision: 'rejected', note: 'Terlalu santai' });
    expect(h.audit.getEvents().at(-1)!.action).toBe('approval.rejected');
    expect(JSON.stringify(h.audit.getEvents())).not.toContain('Terlalu santai');
  });

  it('first writer wins: of two simultaneous decisions exactly one resumes the run', async () => {
    const approval = await seedApproval(h);
    const results = await Promise.allSettled([
      h.decide.execute(approval.id, { decision: 'approve', version: 1 }, alice),
      h.decide.execute(approval.id, { decision: 'reject', version: 1 }, admin),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((loser.reason as DomainError).code).toBe('already_decided');
    expect(h.gateway.resumeRequests).toHaveLength(1);
  });

  it('a second decision sees who decided first and the approval stays as it was', async () => {
    const approval = await seedApproval(h);
    await h.decide.execute(approval.id, { decision: 'approve', version: 1 }, owner);
    const error = await h.decide.execute(approval.id, { decision: 'reject', version: 1 }, admin).catch((e: DomainError) => e);
    expect((error as DomainError).code).toBe('already_decided');
    expect((error as DomainError).status).toBe(409);
    expect((error as DomainError).details).toContainEqual({ code: 'already_decided', field: 'decided_by', detail: 'Rina' });
    expect((await h.inbox.findApproval(WS, approval.id))!.status).toBe('approved');
    expect(h.gateway.resumeRequests).toHaveLength(1);
  });

  it('terminal states are immutable: an expired approval cannot be approved', async () => {
    const approval = await seedApproval(h);
    await h.inbox.expireApproval(approval.id, NOW);
    await expectCode(h.decide.execute(approval.id, { decision: 'approve', version: 1 }, owner), 'already_decided', 409);
    expect((await h.inbox.findApproval(WS, approval.id))!.status).toBe('expired');
  });

  it('rejects a stale version with version_conflict and does not resume', async () => {
    const approval = await seedApproval(h);
    await expectCode(h.decide.execute(approval.id, { decision: 'approve', version: 7 }, alice), 'version_conflict', 409);
    expect(h.gateway.resumeRequests).toHaveLength(0);
  });

  it('re-hashes and revalidates an edited payload and records a user revision', async () => {
    const approval = await seedApproval(h);
    const view = await h.decide.execute(
      approval.id,
      { decision: 'approve', version: 1, edited_payload: { body: 'Diskon 25% akhir pekan.' } },
      alice,
    );
    const edited = { ...PAYLOAD, body: 'Diskon 25% akhir pekan.' };
    expect(view.approval).toMatchObject({ status: 'approved', revision: 2 });
    expect(h.gateway.resumeRequests[0].body).toMatchObject({ edited: true, payload_hash: hashPayload(edited) });
    const revisions = await h.inbox.listRevisions(approval.id);
    expect(revisions.map((r) => [r.revision, r.created_by])).toEqual([[1, 'specialist'], [2, 'user']]);
    expect(h.audit.getEvents().map((e) => e.action)).toEqual([
      'approval.requested',
      'approval.edited',
      'approval.approved',
    ]);
  });

  it('refuses an edit to a field the type does not mark editable, or one that breaks validation', async () => {
    const approval = await seedApproval(h);
    await expectCode(
      h.decide.execute(approval.id, { decision: 'approve', version: 1, edited_payload: { draft_kind: 'email' } }, alice),
      'field_not_editable',
      422,
    );
    await expectCode(
      h.decide.execute(approval.id, { decision: 'approve', version: 1, edited_payload: { body: '' } }, alice),
      'invalid_payload',
      422,
    );
    expect(h.gateway.resumeRequests).toHaveLength(0);
    expect((await h.inbox.findApproval(WS, approval.id))!.status).toBe('pending');
  });

  it('unreachable sineva-ai: typed 503, the item stays pending, and a retry succeeds', async () => {
    const approval = await seedApproval(h);
    h.gateway.resumeFailure = new UpstreamUnavailableError();

    await expectCode(h.decide.execute(approval.id, { decision: 'approve', version: 1 }, alice), 'run_resume_unavailable', 503);
    const after = (await h.inbox.findApproval(WS, approval.id))!;
    expect(after).toMatchObject({ status: 'pending', version: 1, claimed_at: null });
    expect((await h.inbox.findBundle(WS, approval.inbox_item_id))!.item.state).toBe('open');
    expect(h.audit.getEvents().map((e) => e.action)).toEqual(['approval.requested']);

    h.gateway.resumeFailure = null;
    const view = await h.decide.execute(approval.id, { decision: 'approve', version: 1 }, alice);
    expect(view.approval!.status).toBe('approved');
  });

  it('a bad answer from sineva-ai is a typed 502 and the item also stays pending', async () => {
    const approval = await seedApproval(h);
    h.gateway.resumeFailure = new UpstreamServiceError();
    await expectCode(h.decide.execute(approval.id, { decision: 'approve', version: 1 }, alice), 'UPSTREAM_ERROR', 502);
    expect((await h.inbox.findApproval(WS, approval.id))!.status).toBe('pending');
  });

  it('commits the decision and its audit event together: a failed audit write rolls the decision back', async () => {
    const failing: AuditLogger = {
      log: async (e) => {
        if (e.action === 'approval.approved') throw new Error('audit down');
      },
    };
    const f = harness(failing);
    const approval = (await f.create.execute(approvalInput(), systemCtx())).approval!;
    await expect(f.decide.execute(approval.id, { decision: 'approve', version: 1 }, alice)).rejects.toThrow('audit down');
    expect((await f.inbox.findApproval(WS, approval.id))!.status).toBe('pending');
    expect(f.transactions.rollbacks).toBe(1);
  });

  it('a member decides only items addressed to them; an admin decides any', async () => {
    const approval = await seedApproval(h);
    await expectCode(h.decide.execute(approval.id, { decision: 'approve', version: 1 }, bob), 'RESOURCE_NOT_FOUND', 404);
    expect(h.gateway.resumeRequests).toHaveLength(0);
    const view = await h.decide.execute(approval.id, { decision: 'approve', version: 1 }, admin);
    expect(view.approval!.status).toBe('approved');
  });

  it('is invisible across workspaces: 404', async () => {
    const approval = await seedApproval(h);
    await expectCode(
      h.decide.execute(approval.id, { decision: 'approve', version: 1 }, ctx(OWNER, 'owner', OTHER_WS)),
      'RESOURCE_NOT_FOUND',
      404,
    );
  });

  it('ask for changes: tells the run, keeps the old revision, waits for a new one', async () => {
    const approval = await seedApproval(h);
    const view = await h.changes.execute(approval.id, { version: 1, instruction: 'Buat lebih singkat' }, alice);

    expect(view.approval).toMatchObject({ status: 'pending', awaiting_revision: true, version: 2 });
    expect(view.state).toBe('open');
    expect(h.gateway.resumeRequests[0].body).toMatchObject({
      decision: 'changes_requested',
      instruction: 'Buat lebih singkat',
      revision: 1,
    });
    expect(h.audit.getEvents().at(-1)!.action).toBe('approval.changes_requested');
    expect(JSON.stringify(h.audit.getEvents())).not.toContain('Buat lebih singkat');
    expect((await h.inbox.listRevisions(approval.id)).map((r) => r.revision)).toEqual([1]);

    await expectCode(h.decide.execute(approval.id, { decision: 'approve', version: 2 }, alice), 'awaiting_revision', 409);
  });

  it('ask for changes also leaves the item pending when sineva-ai is unreachable', async () => {
    const approval = await seedApproval(h);
    h.gateway.resumeFailure = new UpstreamUnavailableError();
    await expectCode(h.changes.execute(approval.id, { version: 1, instruction: 'x' }, alice), 'run_resume_unavailable', 503);
    expect((await h.inbox.findApproval(WS, approval.id))).toMatchObject({ awaiting_revision: false, claimed_at: null });
  });
});

describe('answering and dismissing input requests (FR-INBOX-15)', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  async function seedInput() {
    const created = await h.create.execute(inputInput(), systemCtx());
    return created;
  }

  it('answers: resumes the run with the answers, resolves the item, audits without the answers', async () => {
    const { item, input_request } = await seedInput();
    const view = await h.answer.execute(item.id, { version: 1, answers: { period: '2026-09', currency: 'IDR' } }, alice);

    expect(view.state).toBe('resolved');
    expect(view.input_request).toMatchObject({ status: 'answered' });
    expect(h.gateway.resumeRequests[0]).toMatchObject({
      runId: UP_RUN,
      body: { kind: 'input_request', input_request_id: UP_INPUT, decision: 'answered', answers: { period: '2026-09', currency: 'IDR' } },
    });
    const events = h.audit.getEvents();
    expect(events.at(-1)!.action).toBe('input.answered');
    expect(JSON.stringify(events)).not.toContain('2026-09');
    expect(input_request!.status).toBe('pending');
  });

  it('refuses answers that do not fit the form', async () => {
    const { item } = await seedInput();
    await expectCode(h.answer.execute(item.id, { version: 1, answers: { currency: 'IDR' } }, alice), 'invalid_answer', 422);
    await expectCode(h.answer.execute(item.id, { version: 1, answers: { period: 'x', currency: 'EUR' } }, alice), 'invalid_answer', 422);
    await expectCode(h.answer.execute(item.id, { version: 1, answers: { period: 'x', currency: 'IDR', extra: 1 } }, alice), 'invalid_answer', 422);
    expect(h.gateway.resumeRequests).toHaveLength(0);
  });

  it('a second answer loses; sineva-ai down leaves it pending with a typed 503', async () => {
    const { item } = await seedInput();
    h.gateway.resumeFailure = new UpstreamUnavailableError();
    await expectCode(h.answer.execute(item.id, { version: 1, answers: { period: 'a', currency: 'IDR' } }, alice), 'run_resume_unavailable', 503);
    expect((await h.inbox.findBundle(WS, item.id))!.item.state).toBe('open');
    h.gateway.resumeFailure = null;
    await h.answer.execute(item.id, { version: 1, answers: { period: 'a', currency: 'IDR' } }, alice);
    await expectCode(h.answer.execute(item.id, { version: 1, answers: { period: 'b', currency: 'IDR' } }, admin), 'already_decided', 409);
  });

  it('only the addressed member (or an admin) may answer', async () => {
    const { item } = await seedInput();
    await expectCode(h.answer.execute(item.id, { version: 1, answers: { period: 'a', currency: 'IDR' } }, bob), 'RESOURCE_NOT_FOUND', 404);
  });

  it('dismiss resumes the run with "dismissed"; approvals cannot be dismissed', async () => {
    const { item } = await seedInput();
    const view = await h.dismiss.execute(item.id, alice);
    expect(view.state).toBe('dismissed');
    expect(h.gateway.resumeRequests[0].body).toMatchObject({ decision: 'dismissed' });

    const approval = await seedApproval(h);
    await expectCode(h.dismiss.execute(approval.inbox_item_id, alice), 'not_dismissable', 409);
  });
});

describe('expiry job (FR-INBOX-12)', () => {
  it('expires due approvals, never approves, and resumes the run with "expired"', async () => {
    const h = harness();
    const due = await seedApproval(h, { expires_at: new Date('2026-10-22T09:00:00.000Z') });
    const later = (await h.create.execute(approvalInput({ upstream_approval_id: 'other-1' }), systemCtx())).approval!;

    const result = await h.expire.execute(NOW);

    expect(result.expired_approvals).toBe(1);
    expect((await h.inbox.findApproval(WS, due.id))!.status).toBe('expired');
    expect((await h.inbox.findApproval(WS, later.id))!.status).toBe('pending');
    expect((await h.inbox.findBundle(WS, due.inbox_item_id))!.item.state).toBe('expired');
    expect(h.gateway.resumeRequests).toHaveLength(1);
    expect(h.gateway.resumeRequests[0].body).toMatchObject({ decision: 'expired', result: { executed: false } });
    expect(h.audit.getEvents().map((e) => e.action)).toContain('approval.expired');
    expect(h.minted.at(-1)!.ctx.user_id).toBe(ALICE);
  });

  it('retries a resume that failed on the next run and then stops', async () => {
    const h = harness();
    const due = await seedApproval(h, { expires_at: new Date('2026-10-22T09:00:00.000Z') });
    h.gateway.resumeFailure = new UpstreamUnavailableError();
    const first = await h.expire.execute(NOW);
    expect(first).toMatchObject({ expired_approvals: 1, resume_failed: 1, resumed: 0 });
    expect(h.logged).toContain('expiry_resume_failed');
    expect((await h.inbox.findApproval(WS, due.id))!.status).toBe('expired');

    h.gateway.resumeFailure = null;
    const second = await h.expire.execute(NOW);
    expect(second).toMatchObject({ expired_approvals: 0, resumed: 1, resume_failed: 0 });
    const third = await h.expire.execute(NOW);
    expect(third.resumed).toBe(0);
  });

  it('expires an input request at its deadline and leaves a claimed approval alone', async () => {
    const h = harness();
    await h.create.execute(inputInput({ expires_at: new Date('2026-10-22T09:00:00.000Z') }), systemCtx());
    const claimed = await seedApproval(h, { expires_at: new Date('2026-10-22T09:00:00.000Z') });
    await h.inbox.claimApproval(claimed.id, { expected_version: 1, user_id: ALICE, decision: 'approve' }, NOW);

    const result = await h.expire.execute(NOW);
    expect(result.expired_inputs).toBe(1);
    expect(result.expired_approvals).toBe(0);
  });

  it('releases a crashed decision claim and reports reminders due within 24 hours', async () => {
    const h = harness();
    const a = await seedApproval(h, { expires_at: new Date('2026-10-23T08:00:00.000Z') });
    await h.inbox.claimApproval(a.id, { expected_version: 1, user_id: ALICE, decision: 'approve' }, new Date('2026-10-22T09:00:00.000Z'));

    const result = await h.expire.execute(NOW);
    expect(result.stale_claims_released).toBe(1);
    expect((await h.inbox.findApproval(WS, a.id))!.claimed_at).toBeNull();
    expect(result.reminders_due).toEqual([{ approval_id: a.id, inbox_item_id: a.inbox_item_id, workspace_id: WS }]);
  });
});

describe('visibility, listing, counts and reads (FR-INBOX-01, 04, 05)', () => {
  let h: ReturnType<typeof harness>;
  let aliceApproval: Awaited<ReturnType<typeof seedApproval>>;
  beforeEach(async () => {
    h = harness();
    aliceApproval = await seedApproval(h);
    await h.create.execute(approvalInput({ upstream_approval_id: 'bob-1' }, BOB), systemCtx());
    await h.create.execute(inputInput(), systemCtx());
    const done = await seedApproval(h, { upstream_approval_id: 'done-1' });
    await h.decide.execute(done.id, { decision: 'reject', version: 1 }, alice);
  });

  it('owner and admin see every item; a member sees only their own; a viewer only Done', async () => {
    expect((await h.list.execute({ limit: 50 }, owner)).items).toHaveLength(4);
    expect((await h.list.execute({ limit: 50 }, admin)).items).toHaveLength(4);
    const mine = await h.list.execute({ limit: 50 }, alice);
    expect(mine.items.map((i) => i.id)).not.toContain(
      (await h.inbox.findApprovalByUpstreamId(WS, 'bob-1'))!.inbox_item_id,
    );
    expect(mine.items).toHaveLength(3);
    const seen = await h.list.execute({ limit: 50 }, viewer);
    expect(seen.items.map((i) => i.tab)).toEqual(['done']);
    expect((await h.list.execute({ limit: 50, tab: 'needs_review' }, viewer)).items).toEqual([]);
  });

  it('filters by tab and specialist and pages with a cursor', async () => {
    const review = await h.list.execute({ limit: 50, tab: 'needs_review' }, owner);
    expect(review.items.every((i) => i.tab === 'needs_review')).toBe(true);
    expect((await h.list.execute({ limit: 50, agent_slug: 'sinofinance' }, owner)).items).toHaveLength(1);

    const page1 = await h.list.execute({ limit: 2 }, owner);
    expect(page1.items).toHaveLength(2);
    expect(page1.next_cursor).toBeTruthy();
    const page2 = await h.list.execute({ limit: 2, cursor: page1.next_cursor! }, owner);
    expect(page2.items).toHaveLength(2);
    expect(new Set([...page1.items, ...page2.items].map((i) => i.id)).size).toBe(4);
    expect(page2.next_cursor).toBeNull();
  });

  it('shows a viewer a Done summary without the draft body, and hides open items from them', async () => {
    const doneItem = (await h.list.execute({ limit: 50, tab: 'done' }, viewer)).items[0];
    const detail = await h.get.execute(doneItem.id, viewer);
    expect(detail.approval).toBeTruthy();
    expect(JSON.stringify(detail)).not.toContain('Diskon 20%');
    expect(detail.payload).toBeUndefined();

    await expectCode(h.get.execute(aliceApproval.inbox_item_id, viewer), 'RESOURCE_NOT_FOUND', 404);
    const full = await h.get.execute(aliceApproval.inbox_item_id, alice);
    expect(full.payload).toEqual(PAYLOAD);
    expect(full.editable_fields).toEqual(['title', 'body']);
    expect(full.approve_note_key).toBe('inbox.approve_note.draft_review');
    expect(full.revisions?.map((r) => r.revision)).toEqual([1]);
    await expectCode(h.get.execute(aliceApproval.inbox_item_id, bob), 'RESOURCE_NOT_FOUND', 404);
  });

  it('counts needs_review and needs_input for the badge and tracks unread per user', async () => {
    const before = await h.counts.execute(alice);
    expect(before).toMatchObject({ needs_review: 1, needs_input: 1, done: 1, badge: 2, unread_needs_review: 1, unread_needs_input: 1 });

    await h.read.execute(aliceApproval.inbox_item_id, alice);
    await h.read.execute(aliceApproval.inbox_item_id, alice);
    expect((await h.counts.execute(alice)).unread_needs_review).toBe(0);
    expect((await h.counts.execute(admin)).unread_needs_review).toBe(2);

    const viewerCounts = await h.counts.execute(viewer);
    expect(viewerCounts).toMatchObject({ needs_review: 0, needs_input: 0, badge: 0, done: 1, updates: 0 });
  });

  it('reading an item you cannot see is a 404', async () => {
    await expectCode(h.read.execute(aliceApproval.inbox_item_id, bob), 'RESOURCE_NOT_FOUND', 404);
  });
});

describe('service wiring', () => {
  it('exposes the decision service the use cases share', () => {
    const h = harness();
    expect(new ApprovalDecisionService(h.deps)).toBeInstanceOf(ApprovalDecisionService);
  });
});

describe('triage views, filters and the link back (ADR-0034)', () => {
  let h: ReturnType<typeof harness>;
  let aliceApproval: Awaited<ReturnType<typeof seedApproval>>;
  const result = (over: object = {}) => ({
    kind: 'result' as const,
    workspace_id: WS,
    recipient_user_id: ALICE,
    agent_slug: 'sinoinsights',
    title: 'Laporan mingguan siap',
    source: { type: 'chat' as const, id: HANDLE },
    dedupe_key: 'result:1',
    summary_key: 'inbox.sentence.result',
    summary_params: {},
    ...over,
  });
  beforeEach(async () => {
    h = harness();
    aliceApproval = await seedApproval(h);
    await h.create.execute(inputInput(), systemCtx());
    await h.create.execute(result(), systemCtx());
    await h.create.execute(
      { ...approvalInput({ upstream_approval_id: 'room-1' }), source: { type: 'room', id: null }, title: 'Room draft' },
      systemCtx(),
    );
    const done = await seedApproval(h, { upstream_approval_id: 'done-1' });
    await h.decide.execute(done.id, { decision: 'reject', version: 1 }, alice);
  });

  it('needs_you holds open approvals and questions, updates holds results, done holds neither', async () => {
    const needs = await h.list.execute({ limit: 50, tab: 'needs_you' }, alice);
    expect(needs.items.map((i) => i.kind).sort()).toEqual(['approval', 'approval', 'input_request']);
    expect(needs.items.every((i) => i.state === 'open')).toBe(true);
    const updates = await h.list.execute({ limit: 50, tab: 'updates' }, alice);
    expect(updates.items.map((i) => i.kind)).toEqual(['result']);
    expect(updates.items[0].tab).toBe('updates');
    const done = await h.list.execute({ limit: 50, tab: 'done' }, alice);
    expect(done.items.map((i) => i.kind)).toEqual(['approval']);
    expect(done.items[0].state).toBe('resolved');
  });

  it('filters by kind, source and a case-insensitive part of the title before paging', async () => {
    expect((await h.list.execute({ limit: 50, kind: 'input_request' }, alice)).items).toHaveLength(1);
    expect((await h.list.execute({ limit: 50, source_type: 'room' }, alice)).items.map((i) => i.title)).toEqual([
      'Room draft',
    ]);
    expect((await h.list.execute({ limit: 50, q: 'MINGGUAN' }, alice)).items.map((i) => i.kind)).toEqual(['result']);
    expect((await h.list.execute({ limit: 50, q: 'nothing like this' }, alice)).items).toEqual([]);
    const paged = await h.list.execute({ limit: 1, tab: 'needs_you', q: 'draft' }, alice);
    expect(paged.items).toHaveLength(1);
  });

  it('shows a viewer Updates and Done summaries and nothing that needs a person', async () => {
    expect((await h.list.execute({ limit: 50, tab: 'updates' }, viewer)).items.map((i) => i.kind)).toEqual(['result']);
    expect((await h.list.execute({ limit: 50, tab: 'needs_you' }, viewer)).items).toEqual([]);
    const seen = await h.list.execute({ limit: 50 }, viewer);
    expect(seen.items.map((i) => i.tab).sort()).toEqual(['done', 'updates']);
    const viewerCounts = await h.counts.execute(viewer);
    expect(viewerCounts).toMatchObject({ badge: 0, done: 1, updates: 1 });
  });

  it('counts Updates and unread Updates, and keeps results out of Done', async () => {
    expect(await h.counts.execute(alice)).toMatchObject({ updates: 1, unread_updates: 1, done: 1, badge: 3 });
    const update = (await h.list.execute({ limit: 50, tab: 'updates' }, alice)).items[0];
    await h.read.execute(update.id, alice);
    expect((await h.counts.execute(alice)).unread_updates).toBe(0);
  });

  it('gives the detail of a chat item the conversation to link back to, never a viewer', async () => {
    const own = await h.get.execute(aliceApproval.inbox_item_id, alice);
    expect(own.source).toEqual({ type: 'chat', id: HANDLE, conversation_id: CONVERSATION });
    const room = (await h.list.execute({ limit: 50, source_type: 'room' }, alice)).items[0];
    expect((await h.get.execute(room.id, alice)).source.conversation_id).toBeNull();
    const update = (await h.list.execute({ limit: 50, tab: 'updates' }, viewer)).items[0];
    expect((await h.get.execute(update.id, viewer)).source).toEqual({ type: 'chat', id: null, conversation_id: null });
  });
});
