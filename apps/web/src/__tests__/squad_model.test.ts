import { describe, expect, it } from 'vitest';
import {
  attentionKey,
  capKey,
  contributorsOf,
  foreignMention,
  memberLimitProblem,
  reduceLiveTurn,
  squadState,
  stateFromTurn,
  turnForRun,
  type LiveTurn,
} from '@/client/components/squads/squad_model';
import type { SquadHandoffView, SquadTurnView, SquadView } from '@/shared/squad_view';

const squad = (over: Partial<SquadView> = {}): SquadView => ({
  id: 's1',
  name: 'Back-office',
  goal: 'g',
  lead_type: 'sino',
  lead_agent_slug: null,
  template_slug: null,
  status: 'active',
  members: [{ agent_slug: 'sinofinance', position: 0 }, { agent_slug: 'sinopeople', position: 1 }],
  attention: [],
  my_access: 'open',
  can_edit: true,
  ceiling_points: 40,
  created_at: 'x',
  updated_at: 'x',
  ...over,
});

const handoff = (over: Partial<SquadHandoffView> = {}): SquadHandoffView => ({
  delegation_id: 'd1', position: 0, from_slug: 'sino', to_slug: 'sinofinance', task_summary: 'Check cash flow',
  parallel_group: 1, status: 'done', summary: 'ok', error_code: null, points: 5, ...over,
});

const turn = (over: Partial<SquadTurnView> = {}): SquadTurnView => ({
  run_handle: 'run_1', lead_slug: 'sino', direct_slug: null, ceiling_points: 40, status: 'completed',
  termination_reason: 'done', delegation_count: 1, points: 5, created_at: 'x', finished_at: 'x', handoffs: [handoff()], ...over,
});

describe('squad state for the cards and the page (FR-SQD-26, FR-SQD-18)', () => {
  it('ranks archived, no access, attention, unchecked, ready', () => {
    expect(squadState(squad())).toBe('ready');
    expect(squadState(squad({ status: 'archived' }))).toBe('archived');
    expect(squadState(squad({ my_access: 'ask_admin' }))).toBe('no_access');
    expect(squadState(squad({ attention: [{ reason: 'member_disabled', agent_slug: 'sinopeople' }] }))).toBe('attention');
    expect(squadState(squad({ attention: null }))).toBe('unchecked');
    // An archived squad is never also "needs attention", and access wins over attention.
    expect(squadState(squad({ status: 'archived', my_access: 'ask_admin' }))).toBe('archived');
    expect(squadState(squad({ my_access: 'ask_admin', attention: [{ reason: 'lead_removed', agent_slug: null }] }))).toBe('no_access');
  });

  it('maps each attention reason and each cap to a message key', () => {
    expect(attentionKey('member_disabled')).toBe('attention_member_disabled');
    expect(attentionKey('lead_removed')).toBe('attention_lead_removed');
    expect(attentionKey('connection_missing')).toBe('attention_connection_missing');
    expect(capKey('cap_credits')).toBe('cap_credits');
  });
});

describe('member limits name the limit and the count (FR-SQD-06)', () => {
  it('is quiet for 2 to 5 and loud outside', () => {
    expect(memberLimitProblem(2)).toBeNull();
    expect(memberLimitProblem(5)).toBeNull();
    expect(memberLimitProblem(1)).toEqual({ min: 2, max: 5, count: 1 });
    expect(memberLimitProblem(6)).toEqual({ min: 2, max: 5, count: 6 });
    expect(memberLimitProblem(0)).toEqual({ min: 2, max: 5, count: 0 });
  });
});

describe('a leading @mention of someone outside the squad (FR-SQD-10)', () => {
  const members = ['SinoFinance', 'SinoPeople'];
  it('names the specialist when it is not a member', () => {
    expect(foreignMention('@SinoTax check my VAT', members)).toBe('SinoTax');
    expect(foreignMention('@SinoSales draft a reply', members)).toBe('SinoSales');
  });
  it('lets members, Sino and plain text through', () => {
    expect(foreignMention('@SinoFinance runway?', members)).toBeNull();
    expect(foreignMention('@sinofinance runway?', members)).toBeNull();
    expect(foreignMention('@Sino please summarize', members)).toBeNull();
    expect(foreignMention('Please ask @SinoTax later', members)).toBeNull();
    expect(foreignMention('  @SinoTax with leading space', members)).toBe('SinoTax');
    expect(foreignMention('no mention', members)).toBeNull();
  });
});

describe('turns and handoffs on the page', () => {
  it('finds the turn of a run and lists who contributed, once each, failed members left out', () => {
    const turns = [turn(), turn({ run_handle: 'run_2', handoffs: [handoff(), handoff({ delegation_id: 'd2', to_slug: 'sinopeople' }), handoff({ delegation_id: 'd3', to_slug: 'sinopeople', status: 'failed' }), handoff({ delegation_id: 'd4', to_slug: 'sinohelp', status: 'failed' })] })];
    expect(turnForRun(turns, 'run_2')?.run_handle).toBe('run_2');
    expect(turnForRun(turns, 'nope')).toBeNull();
    expect(contributorsOf(turns[1]!.handoffs)).toEqual(['sinofinance', 'sinopeople']);
    expect(contributorsOf([])).toEqual([]);
  });

  it('derives the cap that stopped a turn only from a cap reason', () => {
    expect(stateFromTurn(turn({ termination_reason: 'cap_time' }))).toEqual({ limit: 'cap_time' });
    expect(stateFromTurn(turn({ termination_reason: 'done' }))).toEqual({ limit: null });
    expect(stateFromTurn(turn({ termination_reason: null }))).toEqual({ limit: null });
  });
});

describe('live turn reducer (handoff, handoff_result, turn_limit)', () => {
  const start: LiveTurn = { handoffs: [], limit: null };

  it('adds a working card, then updates it in place without moving it', () => {
    let state = reduceLiveTurn(start, { event: 'handoff', data: { delegation_id: 'd1', from: 'sino', to: 'sinofinance', task_summary: 'Cash flow', parallel_group: 1 } });
    state = reduceLiveTurn(state, { event: 'handoff', data: { delegation_id: 'd2', from: 'sino', to: 'sinopeople', task_summary: 'Payroll', parallel_group: 1 } });
    expect(state.handoffs.map((h) => [h.delegation_id, h.status])).toEqual([['d1', 'working'], ['d2', 'working']]);
    state = reduceLiveTurn(state, { event: 'handoff_result', data: { delegation_id: 'd1', status: 'done', summary: 'Positive', points: 5 } });
    expect(state.handoffs.map((h) => [h.delegation_id, h.status, h.summary])).toEqual([['d1', 'done', 'Positive'], ['d2', 'working', null]]);
  });

  it('does not add a card twice for a replayed handoff, and ignores a result for an unknown delegation', () => {
    const data = { delegation_id: 'd1', from: 'sino', to: 'sinofinance', task_summary: 'Cash flow', parallel_group: null };
    let state = reduceLiveTurn(start, { event: 'handoff', data });
    state = reduceLiveTurn(state, { event: 'handoff', data });
    expect(state.handoffs).toHaveLength(1);
    expect(reduceLiveTurn(state, { event: 'handoff_result', data: { delegation_id: 'zzz', status: 'done' } })).toEqual(state);
  });

  it('keeps a failed member as failed with its code, never as done', () => {
    let state = reduceLiveTurn(start, { event: 'handoff', data: { delegation_id: 'd1', from: 'sino', to: 'sinofinance', task_summary: 'x' } });
    state = reduceLiveTurn(state, { event: 'handoff_result', data: { delegation_id: 'd1', status: 'failed', error_code: 'member_unavailable' } });
    expect(state.handoffs[0]).toMatchObject({ status: 'failed', error_code: 'member_unavailable' });
  });

  it('records the cap and what was left unfinished', () => {
    const state = reduceLiveTurn(start, { event: 'turn_limit', data: { cap: 'cap_credits', unfinished: ['Tax summary'] } });
    expect(state.limit).toEqual({ cap: 'cap_credits', unfinished: ['Tax summary'] });
  });

  it('ignores payloads that are not the contract, so a bad frame cannot break the screen', () => {
    expect(reduceLiveTurn(start, { event: 'handoff', data: { nope: true } })).toEqual(start);
    expect(reduceLiveTurn(start, { event: 'handoff', data: 'text' })).toEqual(start);
    expect(reduceLiveTurn(start, { event: 'turn_limit', data: { cap: 'cap_magic' } })).toEqual(start);
    expect(reduceLiveTurn(start, { event: 'card_started', data: {} })).toEqual(start);
  });
});
