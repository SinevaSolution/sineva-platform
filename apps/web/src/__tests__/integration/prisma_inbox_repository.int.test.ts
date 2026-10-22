import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RepositoryAuditLogger } from '@/server/application/audit/repository_audit_logger';
import { CreateInboxItemUseCase } from '@/server/application/use-cases/inbox/create_inbox_item_use_case';
import { DecideApprovalUseCase } from '@/server/application/use-cases/inbox/decide_approval_use_case';
import { ExpireInboxItemsUseCase } from '@/server/application/use-cases/inbox/expire_inbox_items_use_case';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import { hashPayload } from '@/server/domain/approvals/action_types';
import { STALE_CLAIM_MS } from '@/server/domain/inbox/inbox_item';
import type { NewApprovalRecord, NewInputRecord } from '@/server/domain/repositories/inbox_repository';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';
import { PrismaAuditRepository } from '@/server/infrastructure/database/prisma_audit_repository';
import { PrismaInboxRepository } from '@/server/infrastructure/database/prisma_inbox_repository';
import { PrismaTransactionRunner } from '@/server/infrastructure/database/prisma_transaction_runner';
import { FakeAiEngineGateway } from '../fakes/fake_ai_engine_gateway';

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
const inbox = new PrismaInboxRepository(prisma);
const transactions = new PrismaTransactionRunner(prisma);

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

let WS = '';
let OTHER_WS = '';
let ALICE = '';
let BOB = '';
const NOW = new Date('2026-10-22T10:00:00.000Z');

beforeEach(async () => {
  const [w1, w2] = await Promise.all([
    prisma.workspace.create({ data: { workspace_slug: 'inbox-a', workspace_name: 'A' } }),
    prisma.workspace.create({ data: { workspace_slug: 'inbox-b', workspace_name: 'B' } }),
  ]);
  const [a, b] = await Promise.all([
    prisma.user.create({ data: { email: 'alice@inbox.test', full_name: 'Alice Wong', preferred_name: 'Alice' } }),
    prisma.user.create({ data: { email: 'bob@inbox.test', full_name: 'Bob Tan' } }),
  ]);
  WS = w1.id;
  OTHER_WS = w2.id;
  ALICE = a.id;
  BOB = b.id;
});

const PAYLOAD = { draft_kind: 'post', title: 'Promo', body: 'Diskon 20%' };

function approvalRecord(over: Partial<NewApprovalRecord> = {}): NewApprovalRecord {
  return {
    workspace_id: WS,
    recipient_user_id: ALICE,
    agent_slug: 'sinosocial',
    title: 'Caption',
    summary_key: 'inbox.sentence.draft_review',
    summary_params: { specialist_slug: 'sinosocial', draft_kind: 'post' },
    source_type: 'chat',
    source_id: 'run_0a1b2c3d-0000-4000-8000-000000000001',
    dedupe_key: 'approval:up-1',
    expires_at: new Date('2026-10-29T10:00:00.000Z'),
    upstream_approval_id: 'up-1',
    upstream_run_id: 'upstream-run-1',
    action_type: 'draft.review',
    payload: PAYLOAD,
    payload_hash: hashPayload(PAYLOAD),
    risk_level: 'low',
    requirement: 'guardrail',
    guardrail_reason: 'x',
    ...over,
  };
}

function inputRecord(over: Partial<NewInputRecord> = {}): NewInputRecord {
  return {
    workspace_id: WS,
    recipient_user_id: ALICE,
    agent_slug: 'sinofinance',
    title: 'Periode?',
    summary_key: 'inbox.sentence.input_request',
    summary_params: {},
    source_type: 'chat',
    source_id: 'run_0a1b2c3d-0000-4000-8000-000000000001',
    dedupe_key: 'input:in-1',
    due_at: null,
    upstream_request_id: 'in-1',
    upstream_run_id: 'upstream-run-1',
    question: 'Periode?',
    fields: [{ key: 'period', type: 'text', label: 'Periode', required: true }],
    ...over,
  };
}

describe('inbox tables (WP-M1-40)', () => {
  it('stores an approval with its first revision and is idempotent on the dedupe key', async () => {
    const first = await inbox.createApprovalItem(approvalRecord());
    const second = await inbox.createApprovalItem(approvalRecord());

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.bundle.item.id).toBe(first.bundle.item.id);
    expect(first.bundle.approval).toMatchObject({ status: 'pending', revision: 1, version: 1, payload: PAYLOAD });
    expect(await prisma.inboxItem.count()).toBe(1);
    expect((await inbox.listRevisions(first.bundle.approval!.id)).map((r) => r.revision)).toEqual([1]);
  });

  it('survives two simultaneous creates of one key with exactly one winner', async () => {
    const results = await Promise.all([
      inbox.createApprovalItem(approvalRecord()),
      inbox.createApprovalItem(approvalRecord()),
    ]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await prisma.approval.count()).toBe(1);
  });

  it('claims exactly once under concurrency, on the expected version only', async () => {
    const { bundle } = await inbox.createApprovalItem(approvalRecord());
    const id = bundle.approval!.id;

    expect(await inbox.claimApproval(id, { expected_version: 9, user_id: ALICE, decision: 'approve' }, NOW)).toBe(false);
    const claims = await Promise.all([
      inbox.claimApproval(id, { expected_version: 1, user_id: ALICE, decision: 'approve' }, NOW),
      inbox.claimApproval(id, { expected_version: 1, user_id: BOB, decision: 'reject' }, NOW),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);

    const row = await prisma.approval.findUniqueOrThrow({ where: { id } });
    // Only the claimant can release or commit.
    const loser = row.claimed_by === ALICE ? BOB : ALICE;
    await inbox.releaseApproval(id, loser);
    expect((await prisma.approval.findUniqueOrThrow({ where: { id } })).claimed_at).not.toBeNull();
    expect(
      await inbox.commitApproval(id, { expected_version: 1, user_id: loser, status: 'approved', note: null, now: NOW }),
    ).toBe(false);
  });

  it('commits an edited approval, resolves the item, records the user revision and stays immutable after', async () => {
    const { bundle } = await inbox.createApprovalItem(approvalRecord());
    const id = bundle.approval!.id;
    await inbox.claimApproval(id, { expected_version: 1, user_id: ALICE, decision: 'approve' }, NOW);
    const edited = { ...PAYLOAD, body: 'Diskon 25%' };

    expect(
      await inbox.commitApproval(id, {
        expected_version: 1,
        user_id: ALICE,
        status: 'approved',
        note: null,
        edited: { payload: edited, payload_hash: hashPayload(edited) },
        now: NOW,
      }),
    ).toBe(true);

    const approval = (await inbox.findApproval(WS, id))!;
    expect(approval).toMatchObject({
      status: 'approved',
      version: 2,
      revision: 2,
      decided_by: ALICE,
      decided_by_name: 'Alice',
      payload: edited,
      claimed_at: null,
    });
    expect(approval.resume_delivered_at).not.toBeNull();
    expect((await inbox.findBundle(WS, bundle.item.id))!.item.state).toBe('resolved');
    expect((await inbox.listRevisions(id)).map((r) => [r.revision, r.created_by])).toEqual([[1, 'specialist'], [2, 'user']]);

    // Terminal: no claim, no expiry.
    expect(await inbox.claimApproval(id, { expected_version: 2, user_id: BOB, decision: 'reject' }, NOW)).toBe(false);
    expect(await inbox.expireApproval(id, NOW)).toBe(false);
  });

  it('asks for changes, then accepts only the next revision from the specialist', async () => {
    const { bundle } = await inbox.createApprovalItem(approvalRecord());
    const id = bundle.approval!.id;
    await inbox.claimApproval(id, { expected_version: 1, user_id: ALICE, decision: 'changes' }, NOW);
    await inbox.commitApproval(id, {
      expected_version: 1,
      user_id: ALICE,
      status: 'pending',
      note: null,
      change_request: 'Lebih singkat',
      now: NOW,
    });
    expect(await prisma.approval.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'pending',
      awaiting_revision: true,
      change_request: 'Lebih singkat',
    });
    // Blocked while a revision is awaited.
    expect(await inbox.claimApproval(id, { expected_version: 2, user_id: ALICE, decision: 'approve' }, NOW)).toBe(false);

    const revised = { ...PAYLOAD, body: 'Diskon 20% Jumat' };
    const append = {
      expected_revision: 1,
      payload: revised,
      payload_hash: hashPayload(revised),
      title: 'Caption v2',
      guardrail_reason: 'x',
      expires_at: new Date('2026-11-01T00:00:00.000Z'),
      summary_params: {},
    };
    expect(await inbox.appendRevision(id, { ...append, expected_revision: 5 })).toBe(false);
    expect(await inbox.appendRevision(id, append)).toBe(true);
    expect(await inbox.appendRevision(id, append)).toBe(false);

    expect(await prisma.approval.findUniqueOrThrow({ where: { id } })).toMatchObject({
      revision: 2,
      awaiting_revision: false,
      change_request: null,
      payload: revised,
    });
    expect((await inbox.listRevisions(id)).map((r) => r.revision)).toEqual([1, 2]);
  });

  it('keeps tenants apart: another workspace finds nothing and lists nothing', async () => {
    const { bundle } = await inbox.createApprovalItem(approvalRecord());
    expect(await inbox.findBundle(OTHER_WS, bundle.item.id)).toBeNull();
    expect(await inbox.findApproval(OTHER_WS, bundle.approval!.id)).toBeNull();
    expect((await inbox.list({ workspace_id: OTHER_WS, limit: 10 })).items).toEqual([]);
    const counts = await inbox.counts(OTHER_WS, ALICE);
    expect(counts).toMatchObject({ needs_review: 0, needs_input: 0, done: 0 });
    // The same upstream id in another workspace is a different approval.
    const other = await inbox.createApprovalItem(approvalRecord({ workspace_id: OTHER_WS }));
    expect(other.created).toBe(true);
  });

  it('lists by tab, specialist and recipient with a stable cursor, and counts unread per person', async () => {
    const a = await inbox.createApprovalItem(approvalRecord({ dedupe_key: 'approval:1', upstream_approval_id: '1' }));
    await inbox.createApprovalItem(approvalRecord({ dedupe_key: 'approval:2', upstream_approval_id: '2', recipient_user_id: BOB }));
    await inbox.createInputItem(inputRecord());
    await inbox.createResultItem({
      workspace_id: WS,
      recipient_user_id: ALICE,
      agent_slug: 'sinoinsights',
      title: 'Laporan',
      summary_key: 'inbox.sentence.result',
      summary_params: {},
      source_type: 'chat',
      source_id: null,
      dedupe_key: 'result:1',
    });

    expect((await inbox.list({ workspace_id: WS, tab: 'needs_review', limit: 10 })).items).toHaveLength(2);
    expect((await inbox.list({ workspace_id: WS, tab: 'needs_input', limit: 10 })).items).toHaveLength(1);
    expect((await inbox.list({ workspace_id: WS, tab: 'done', limit: 10 })).items).toHaveLength(0);
    expect((await inbox.list({ workspace_id: WS, tab: 'updates', limit: 10 })).items).toHaveLength(1);
    expect((await inbox.list({ workspace_id: WS, tab: 'needs_you', limit: 10 })).items).toHaveLength(3);
    expect((await inbox.list({ workspace_id: WS, kind: 'input_request', limit: 10 })).items).toHaveLength(1);
    expect((await inbox.list({ workspace_id: WS, q: 'LAPOR', limit: 10 })).items).toHaveLength(1);
    expect((await inbox.list({ workspace_id: WS, source_type: 'room', limit: 10 })).items).toHaveLength(0);
    expect((await inbox.list({ workspace_id: WS, agent_slug: 'sinofinance', limit: 10 })).items).toHaveLength(1);
    expect((await inbox.list({ workspace_id: WS, recipient_user_id: ALICE, limit: 10 })).items).toHaveLength(3);

    const page1 = await inbox.list({ workspace_id: WS, limit: 2 });
    const page2 = await inbox.list({ workspace_id: WS, limit: 2, cursor: page1.next_cursor });
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    expect(page2.next_cursor).toBeNull();
    expect(new Set([...page1.items, ...page2.items].map((i) => i.id)).size).toBe(4);

    expect(await inbox.counts(WS, ALICE, ALICE)).toMatchObject({ needs_review: 1, needs_input: 1, done: 0, updates: 1, unread_updates: 1, unread_needs_review: 1 });
    await inbox.markRead(WS, a.bundle.item.id, ALICE, NOW);
    await inbox.markRead(WS, a.bundle.item.id, ALICE, new Date('2026-10-23T00:00:00.000Z'));
    expect((await inbox.counts(WS, ALICE, ALICE)).unread_needs_review).toBe(0);
    expect((await inbox.counts(WS, BOB)).unread_needs_review).toBe(2);
    const read = await prisma.inboxItemRead.findMany({ where: { inbox_item_id: a.bundle.item.id } });
    expect(read).toHaveLength(1);
    expect(read[0].read_at.toISOString()).toBe(NOW.toISOString());
    expect(await inbox.readItemIds(BOB, [a.bundle.item.id])).toEqual(new Set());
  });

  it('settles an input request once', async () => {
    const { bundle } = await inbox.createInputItem(inputRecord());
    const id = bundle.input_request!.id;
    expect(bundle.input_request!.fields).toEqual([{ key: 'period', type: 'text', label: 'Periode', required: true }]);

    const claims = await Promise.all([
      inbox.claimInputRequest(id, { expected_version: 1, user_id: ALICE }, NOW),
      inbox.claimInputRequest(id, { expected_version: 1, user_id: BOB }, NOW),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const winner = (await prisma.inputRequest.findUniqueOrThrow({ where: { id } })).claimed_by!;
    expect(
      await inbox.commitInputRequest(id, { expected_version: 1, user_id: winner, status: 'answered', answer: { period: '2026-09' }, now: NOW }),
    ).toBe(true);
    expect((await inbox.findInputRequest(WS, id))).toMatchObject({ status: 'answered', answer: { period: '2026-09' } });
    expect((await inbox.findBundle(WS, bundle.item.id))!.item.state).toBe('resolved');
  });

  it('runs the expiry queries: due, claimed, undelivered, stale claims and reminders', async () => {
    const due = await inbox.createApprovalItem(
      approvalRecord({ dedupe_key: 'approval:due', upstream_approval_id: 'due', expires_at: new Date('2026-10-22T09:00:00.000Z') }),
    );
    const claimed = await inbox.createApprovalItem(
      approvalRecord({ dedupe_key: 'approval:claimed', upstream_approval_id: 'claimed', expires_at: new Date('2026-10-22T09:00:00.000Z') }),
    );
    const soon = await inbox.createApprovalItem(
      approvalRecord({ dedupe_key: 'approval:soon', upstream_approval_id: 'soon', expires_at: new Date('2026-10-23T08:00:00.000Z') }),
    );
    await inbox.claimApproval(claimed.bundle.approval!.id, { expected_version: 1, user_id: ALICE, decision: 'approve' }, new Date('2026-10-22T09:00:00.000Z'));

    const expirable = await inbox.listExpirable(NOW, 10);
    expect(expirable.approvals.map((a) => a.upstream_approval_id)).toEqual(['due']);

    expect(await inbox.expireApproval(due.bundle.approval!.id, NOW)).toBe(true);
    expect(await inbox.expireApproval(claimed.bundle.approval!.id, NOW)).toBe(false);
    expect((await inbox.findBundle(WS, due.bundle.item.id))!.item.state).toBe('expired');
    expect((await inbox.listUndeliveredExpired(10)).approvals.map((a) => a.upstream_approval_id)).toEqual(['due']);
    await inbox.markResumeDelivered('approval', due.bundle.approval!.id, NOW);
    expect((await inbox.listUndeliveredExpired(10)).approvals).toEqual([]);

    expect(await inbox.releaseStaleClaims(new Date(NOW.getTime() - STALE_CLAIM_MS))).toBe(1);
    expect((await inbox.findApproval(WS, claimed.bundle.approval!.id))!.claimed_at).toBeNull();

    const reminders = await inbox.listReminderDue(NOW, 24 * 60 * 60_000, 10);
    expect(reminders.map((a) => a.id)).toEqual([soon.bundle.approval!.id]);
  });
});

describe('decision with real transactions and the audit table (WP-M1-40, FR-INBOX-08)', () => {
  const ctx = (user: string): RequestContext => ({
    user_id: user,
    workspace_id: WS,
    role: 'admin',
    session_id: 's',
    request_id: 'req-12345678',
    actor: { type: 'user', id: user },
  });

  function build(audit: AuditLogger) {
    const gateway = new FakeAiEngineGateway();
    const deps = {
      inbox,
      audit,
      transactions,
      gateway,
      contextSigner: { mint: async () => ({ token: 't', claims: {} as never }) },
      log: { failed: () => undefined },
      now: () => NOW,
    };
    return { gateway, create: new CreateInboxItemUseCase(deps), decide: new DecideApprovalUseCase(deps), expire: new ExpireInboxItemsUseCase(deps) };
  }

  const create = (u: ReturnType<typeof build>) =>
    u.create.execute(
      {
        kind: 'approval',
        workspace_id: WS,
        recipient_user_id: ALICE,
        agent_slug: 'sinosocial',
        title: 'Caption',
        source: { type: 'chat', id: 'run_0a1b2c3d-0000-4000-8000-000000000001' },
        approval: {
          upstream_approval_id: 'up-9',
          upstream_run_id: 'upstream-run-1',
          revision: 1,
          action_type: 'draft.review',
          payload: PAYLOAD,
          guardrail_reason: null,
        },
      },
      ctx(ALICE),
    );

  it('writes the request, decision and edit audit rows with ids only, in the same transaction as the state', async () => {
    const u = build(new RepositoryAuditLogger(new PrismaAuditRepository(prisma)));
    const created = await create(u);
    await u.decide.execute(
      created.approval!.id,
      { decision: 'approve', version: 1, edited_payload: { body: 'Diskon 30%' } },
      ctx(ALICE),
    );

    const rows = await prisma.auditEvent.findMany({ where: { workspace_id: WS }, orderBy: { occurred_at: 'asc' } });
    expect(rows.map((r) => r.action).sort()).toEqual(['approval.approved', 'approval.edited', 'approval.requested']);
    expect(JSON.stringify(rows)).not.toContain('Diskon');
  });

  it('rolls the state back when the audit write fails, then lets the retry succeed', async () => {
    let fail = true;
    const real = new RepositoryAuditLogger(new PrismaAuditRepository(prisma));
    const u = build({
      log: async (event) => {
        if (event.action === 'approval.approved' && fail) throw new Error('audit down');
        return real.log(event);
      },
    });
    const created = await create(u);

    await expect(u.decide.execute(created.approval!.id, { decision: 'approve', version: 1 }, ctx(ALICE))).rejects.toThrow('audit down');
    const after = await prisma.approval.findUniqueOrThrow({ where: { id: created.approval!.id } });
    expect(after).toMatchObject({ status: 'pending', version: 1, claimed_at: null });
    expect((await prisma.inboxItem.findUniqueOrThrow({ where: { id: created.item.id } })).state).toBe('open');

    fail = false;
    const view = await u.decide.execute(created.approval!.id, { decision: 'approve', version: 1 }, ctx(ALICE));
    expect(view.approval!.status).toBe('approved');
  });

  it('expires through the real repository and resumes the run', async () => {
    const u = build(new RepositoryAuditLogger(new PrismaAuditRepository(prisma)));
    const created = await u.create.execute(
      {
        kind: 'approval',
        workspace_id: WS,
        recipient_user_id: ALICE,
        agent_slug: 'sinosocial',
        title: 'Caption',
        source: { type: 'chat', id: 'run_0a1b2c3d-0000-4000-8000-000000000001' },
        approval: {
          upstream_approval_id: 'up-10',
          upstream_run_id: 'upstream-run-1',
          revision: 1,
          action_type: 'draft.review',
          payload: PAYLOAD,
          guardrail_reason: null,
          expires_at: new Date('2026-10-22T09:00:00.000Z'),
        },
      },
      ctx(ALICE),
    );
    const result = await u.expire.execute(NOW);
    expect(result).toMatchObject({ expired_approvals: 1, resumed: 1 });
    expect((await prisma.approval.findUniqueOrThrow({ where: { id: created.approval!.id } })).status).toBe('expired');
    expect(u.gateway.resumeRequests[0].body).toMatchObject({ decision: 'expired' });
  });
});
