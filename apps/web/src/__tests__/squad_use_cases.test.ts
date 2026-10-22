import { describe, expect, it } from 'vitest';
import type { SquadDeps } from '@/server/application/squads/squad_support';
import { CreateSquadUseCase } from '@/server/application/use-cases/squads/create_squad_use_case';
import { DeleteSquadUseCase } from '@/server/application/use-cases/squads/delete_squad_use_case';
import { GetSquadUseCase } from '@/server/application/use-cases/squads/get_squad_use_case';
import { ListSquadsUseCase } from '@/server/application/use-cases/squads/list_squads_use_case';
import { SetSquadAccessUseCase } from '@/server/application/use-cases/squads/set_squad_access_use_case';
import { SetSquadMembersUseCase } from '@/server/application/use-cases/squads/set_squad_members_use_case';
import { UpdateSquadUseCase } from '@/server/application/use-cases/squads/update_squad_use_case';
import { UseSquadTemplateUseCase } from '@/server/application/use-cases/squads/use_squad_template_use_case';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ENTITLEMENT_KEYS, type EntitlementKey } from '@/server/domain/entitlements/entitlements';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { RecordingEntitlements } from './fakes/library_fakes';
import { FakeTransactionRunner } from './fakes/fake_transaction_runner';
import { FakeSquadDirectory, InMemorySquads } from './fakes/squad_fakes';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const ctx = (over: Partial<RequestContext> = {}): RequestContext => ({
  user_id: OWNER,
  workspace_id: WS,
  session_id: 's',
  request_id: 'r',
  role: 'owner',
  specialist_scope: 'all',
  actor: { type: 'user', id: OWNER },
  ...over,
});

function harness(denied: EntitlementKey[] = []) {
  const squads = new InMemorySquads();
  const transactions = new FakeTransactionRunner();
  squads.onWrite = (undo) => transactions.onRollback(undo);
  const audit = new CountingAuditLogger();
  const directory = new FakeSquadDirectory();
  const entitlements = new RecordingEntitlements(new Set(denied));
  const memberships = new Map<string, boolean>([[`${WS}:${MEMBER}`, true]]);
  const deps: SquadDeps = {
    squads,
    directory,
    audit,
    entitlements,
    transactions,
    members: { findMembership: async (ws: string, user: string) => (memberships.get(`${ws}:${user}`) ? ({ id: 'm', user_id: user } as never) : null) },
  };
  return { squads, audit, directory, entitlements, transactions, deps };
}

const base = { name: 'Back-office', goal: 'Keep the month on track', member_slugs: ['sinofinance', 'sinopeople'], lead_type: 'sino' as const };
const actions = (h: ReturnType<typeof harness>) => h.audit.getEvents().map((e) => e.action);

describe('CreateSquadUseCase (FR-SQD-02, FR-SQD-06)', () => {
  it('creates the squad, checks both entitlements and audits squad.created with ids and counts only', async () => {
    const h = harness();
    const result = await new CreateSquadUseCase(h.deps).execute(base, ctx());
    expect(result.squad.members.map((m) => m.agent_slug)).toEqual(['sinofinance', 'sinopeople']);
    expect(result.my_access).toBe('open');
    expect(result.ceiling_points).toBeGreaterThan(0);
    expect(h.entitlements.checks.map((c) => [c.key, c.quantity])).toEqual([
      [ENTITLEMENT_KEYS.SQUADS, undefined],
      [ENTITLEMENT_KEYS.SQUADS_MAX, 1],
    ]);
    const [event] = h.audit.getEvents();
    expect(event?.action).toBe('squad.created');
    expect(JSON.stringify(event?.metadata)).not.toContain('Keep the month');
  });

  it('blocks creation when the plan does not include squads, before anything is written', async () => {
    const h = harness([ENTITLEMENT_KEYS.SQUADS]);
    await expect(new CreateSquadUseCase(h.deps).execute(base, ctx())).rejects.toMatchObject({ code: 'entitlement_required' });
    expect(h.squads.rows.size).toBe(0);
  });

  it('rejects one member and six members naming the limit', async () => {
    const h = harness();
    const create = new CreateSquadUseCase(h.deps);
    await expect(create.execute({ ...base, member_slugs: ['sinofinance'] }, ctx())).rejects.toMatchObject({
      details: [expect.objectContaining({ code: 'squad_members_count' })],
    });
    await expect(
      create.execute({ ...base, member_slugs: ['sinofinance', 'sinopeople', 'sinosales', 'sinosocial', 'sinohelp', 'sinoinsights'] }, ctx()),
    ).rejects.toMatchObject({ details: [expect.objectContaining({ code: 'squad_members_count' })] });
  });

  it('rejects a disabled specialist and one the creator cannot access', async () => {
    const h = harness();
    h.directory.entries = h.directory.entries.map((e) => (e.agent_slug === 'sinopeople' ? { ...e, enabled: false } : e));
    await expect(new CreateSquadUseCase(h.deps).execute(base, ctx())).rejects.toMatchObject({
      details: [expect.objectContaining({ code: 'squad_member_unavailable' })],
    });
    const h2 = harness();
    await expect(
      new CreateSquadUseCase(h2.deps).execute(base, ctx({ specialist_scope: 'selected', allowed_specialists: ['sinofinance'] })),
    ).rejects.toMatchObject({ details: [expect.objectContaining({ code: 'squad_member_unavailable' })] });
  });

  it('does not create a squad when sineva-ai cannot say who is available (503, no invented roster)', async () => {
    const h = harness();
    h.directory.down();
    await expect(new CreateSquadUseCase(h.deps).execute(base, ctx())).rejects.toMatchObject({ status: 503 });
    expect(h.squads.rows.size).toBe(0);
  });

  it('rolls the squad back when its audit row cannot be written', async () => {
    const h = harness();
    h.deps.audit = { log: async () => { throw new Error('audit down'); } };
    await expect(new CreateSquadUseCase(h.deps).execute(base, ctx())).rejects.toThrow('audit down');
    expect(h.squads.rows.size).toBe(0);
  });
});

describe('Update, members, archive, delete (FR-SQD-04, FR-SQD-05)', () => {
  async function created(h = harness(), over: Partial<RequestContext> = {}) {
    const { squad } = await new CreateSquadUseCase(h.deps).execute(base, ctx(over));
    h.audit.clear();
    return { h, squad };
  }

  it('renames and changes the goal with one squad.updated event listing field names only', async () => {
    const { h, squad } = await created();
    const out = await new UpdateSquadUseCase(h.deps).execute(squad.id, { name: 'Month end', goal: 'Close on time' }, ctx());
    expect(out.squad.name).toBe('Month end');
    expect(actions(h)).toEqual(['squad.updated']);
    expect(h.audit.getEvents()[0]?.metadata).toEqual({ fields: ['name', 'goal'] });
  });

  it('changes the lead to a member and audits squad.lead_changed; a lead who is not a member is rejected', async () => {
    const { h, squad } = await created();
    await new UpdateSquadUseCase(h.deps).execute(squad.id, { lead_type: 'member', lead_agent_slug: 'sinofinance' }, ctx());
    expect(actions(h)).toEqual(['squad.lead_changed']);
    await expect(
      new UpdateSquadUseCase(h.deps).execute(squad.id, { lead_type: 'member', lead_agent_slug: 'sinosales' }, ctx()),
    ).rejects.toMatchObject({ details: [expect.objectContaining({ code: 'squad_lead_invalid' })] });
  });

  it('adds and removes members with one event per specialist, and keeps the count rule', async () => {
    const { h, squad } = await created();
    const set = new SetSquadMembersUseCase(h.deps);
    const out = await set.execute(squad.id, { member_slugs: ['sinofinance', 'sinosales', 'sinohelp'] }, ctx());
    expect(out.squad.members.map((m) => m.agent_slug)).toEqual(['sinofinance', 'sinosales', 'sinohelp']);
    expect(actions(h).sort()).toEqual(['squad.member_added', 'squad.member_added', 'squad.member_removed']);
    await expect(set.execute(squad.id, { member_slugs: ['sinofinance'] }, ctx())).rejects.toMatchObject({
      details: [expect.objectContaining({ code: 'squad_members_count' })],
    });
  });

  it('refuses to drop the member who leads unless the request names a new lead', async () => {
    const { h, squad } = await created();
    await new UpdateSquadUseCase(h.deps).execute(squad.id, { lead_type: 'member', lead_agent_slug: 'sinopeople' }, ctx());
    const set = new SetSquadMembersUseCase(h.deps);
    await expect(set.execute(squad.id, { member_slugs: ['sinofinance', 'sinosales'] }, ctx())).rejects.toMatchObject({
      details: [expect.objectContaining({ code: 'squad_lead_invalid' })],
    });
    const ok = await set.execute(squad.id, { member_slugs: ['sinofinance', 'sinosales'], lead_type: 'sino', lead_agent_slug: null }, ctx());
    expect(ok.squad.lead_type).toBe('sino');
  });

  it('lets a Member edit only squads they created', async () => {
    const h = harness();
    const { squad } = await new CreateSquadUseCase(h.deps).execute(base, ctx({ user_id: MEMBER, role: 'member' }));
    await expect(new UpdateSquadUseCase(h.deps).execute(squad.id, { name: 'Mine' }, ctx({ user_id: MEMBER, role: 'member' }))).resolves.toBeTruthy();
    await expect(
      new UpdateSquadUseCase(h.deps).execute(squad.id, { name: 'Taken' }, ctx({ user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', role: 'member' })),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('lets the creating Member edit but not archive: archiving is Owner or Admin only', async () => {
    const h = harness();
    const as = ctx({ user_id: MEMBER, role: 'member' });
    const { squad } = await new CreateSquadUseCase(h.deps).execute(base, as);
    await expect(new UpdateSquadUseCase(h.deps).execute(squad.id, { status: 'archived' }, as)).rejects.toMatchObject({ status: 403 });
  });

  it('archived squads reject edits; restoring is allowed to Owner or Admin', async () => {
    const { h, squad } = await created();
    const update = new UpdateSquadUseCase(h.deps);
    const archived = await update.execute(squad.id, { status: 'archived' }, ctx());
    expect(archived.squad.status).toBe('archived');
    expect(actions(h)).toEqual(['squad.archived']);
    await expect(update.execute(squad.id, { name: 'Again' }, ctx())).rejects.toMatchObject({
      details: [expect.objectContaining({ code: 'squad_archived' })],
    });
    await expect(new SetSquadMembersUseCase(h.deps).execute(squad.id, { member_slugs: ['sinofinance', 'sinosales'] }, ctx())).rejects.toMatchObject({
      details: [expect.objectContaining({ code: 'squad_archived' })],
    });
    const restored = await update.execute(squad.id, { status: 'active' }, ctx());
    expect(restored.squad.status).toBe('active');
  });

  it('deletes with squad.deleted and answers 404 for another workspace', async () => {
    const { h, squad } = await created();
    await expect(new DeleteSquadUseCase(h.deps).execute(squad.id, ctx({ workspace_id: OTHER_WS }))).rejects.toBeInstanceOf(NotFoundError);
    await new DeleteSquadUseCase(h.deps).execute(squad.id, ctx());
    expect(h.squads.rows.size).toBe(0);
    expect(actions(h)).toEqual(['squad.deleted']);
  });
});

describe('Reading squads (FR-SQD-18, FR-SQD-26)', () => {
  it('reports Ask an admin for a squad whose members the person cannot all use, and open for an admin override', async () => {
    const h = harness();
    const { squad } = await new CreateSquadUseCase(h.deps).execute(base, ctx());
    const restricted = ctx({ user_id: MEMBER, role: 'member', specialist_scope: 'selected', allowed_specialists: ['sinofinance'] });
    expect((await new GetSquadUseCase(h.deps).execute(squad.id, restricted)).my_access).toBe('ask_admin');
    await new SetSquadAccessUseCase(h.deps).execute(squad.id, { user_id: MEMBER, granted: true }, ctx());
    expect(actions(h)).toContain('squad.access_overridden');
    expect((await new GetSquadUseCase(h.deps).execute(squad.id, restricted)).my_access).toBe('open');
  });

  it('only grants an override to a member of the workspace', async () => {
    const h = harness();
    const { squad } = await new CreateSquadUseCase(h.deps).execute(base, ctx());
    await expect(
      new SetSquadAccessUseCase(h.deps).execute(squad.id, { user_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', granted: true }, ctx()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('computes Needs attention from the live roster and says so when the roster cannot be read', async () => {
    const h = harness();
    const { squad } = await new CreateSquadUseCase(h.deps).execute(base, ctx());
    h.directory.entries = h.directory.entries.map((e) => (e.agent_slug === 'sinopeople' ? { ...e, enabled: false } : e));
    const needs = await new GetSquadUseCase(h.deps).execute(squad.id, ctx());
    expect(needs.attention).toEqual([{ reason: 'member_disabled', agent_slug: 'sinopeople' }]);
    h.directory.down();
    const unknown = await new ListSquadsUseCase(h.deps).execute({}, ctx());
    expect(unknown.items[0]?.attention).toBeNull();
  });

  it('never returns another workspace squad', async () => {
    const h = harness();
    const { squad } = await new CreateSquadUseCase(h.deps).execute(base, ctx());
    await expect(new GetSquadUseCase(h.deps).execute(squad.id, ctx({ workspace_id: OTHER_WS }))).rejects.toBeInstanceOf(NotFoundError);
    expect((await new ListSquadsUseCase(h.deps).execute({}, ctx({ workspace_id: OTHER_WS }))).items).toEqual([]);
  });
});

describe('UseSquadTemplateUseCase (FR-SQD-03)', () => {
  it('creates a squad from a template in the requested language, with overrides, linking the template', async () => {
    const h = harness();
    const use = new UseSquadTemplateUseCase(new CreateSquadUseCase(h.deps));
    const out = await use.execute('customer', { name: 'Toko' }, 'id', ctx());
    expect(out.squad.name).toBe('Toko');
    expect(out.squad.goal).toContain('pelanggan');
    expect(out.squad.template_slug).toBe('customer');
    expect(out.squad.members.map((m) => m.agent_slug)).toEqual(['sinohelp', 'sinosales', 'sinoinsights']);
    expect(out.squad.lead_type).toBe('sino');
  });

  it('answers 404 for an unknown template', async () => {
    const h = harness();
    await expect(new UseSquadTemplateUseCase(new CreateSquadUseCase(h.deps)).execute('nope', {}, 'en', ctx())).rejects.toBeInstanceOf(NotFoundError);
  });
});
