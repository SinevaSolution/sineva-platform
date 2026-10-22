// Pure model of the Squads screens: which state a squad is in, what a turn
// looks like while it streams, who contributed. No React, so it is unit tested.

import type {
  SquadAttentionView,
  SquadCapView,
  SquadHandoffStatusView,
  SquadHandoffView,
  SquadTurnView,
  SquadView,
} from '@/shared/squad_view';

export const SQUAD_MEMBERS_MIN = 2;
export const SQUAD_MEMBERS_MAX = 5;
export const SQUAD_GOAL_MAX = 500;

export type SquadState = 'ready' | 'archived' | 'no_access' | 'attention' | 'unchecked';

/**
 * One state per squad, in the order the screen cares about: an archived squad is
 * read-only whatever else is true, "Ask an admin" comes before a fix the person
 * could not make anyway, and an unreadable roster is "could not check", never "fine".
 */
export function squadState(squad: SquadView): SquadState {
  if (squad.status === 'archived') return 'archived';
  if (squad.my_access === 'ask_admin') return 'no_access';
  if (squad.attention === null) return 'unchecked';
  return squad.attention.length > 0 ? 'attention' : 'ready';
}

const ATTENTION_KEYS = {
  member_disabled: 'attention_member_disabled',
  lead_removed: 'attention_lead_removed',
  connection_missing: 'attention_connection_missing',
} as const satisfies Record<SquadAttentionView['reason'], string>;

export function attentionKey(reason: SquadAttentionView['reason']) {
  return ATTENTION_KEYS[reason];
}

export function capKey(cap: SquadCapView): SquadCapView {
  return cap;
}

export function memberLimitProblem(count: number): { min: number; max: number; count: number } | null {
  return count >= SQUAD_MEMBERS_MIN && count <= SQUAD_MEMBERS_MAX
    ? null
    : { min: SQUAD_MEMBERS_MIN, max: SQUAD_MEMBERS_MAX, count };
}

/**
 * The handle of a specialist typed at the very start of a message when that
 * specialist is not in the squad (FR-SQD-10). Typed text only: a mention
 * deeper in the sentence is just words. Sino is the lead and always allowed.
 * The server checks the same rule; this is the calm message before the send.
 */
export function foreignMention(text: string, memberNames: readonly string[]): string | null {
  const match = /^\s*@(Sino[A-Za-z]*)/.exec(text);
  if (!match) return null;
  const handle = match[1] ?? '';
  if (handle.toLowerCase() === 'sino') return null;
  const known = new Set(memberNames.map((name) => name.toLowerCase()));
  return known.has(handle.toLowerCase()) ? null : handle;
}

export function turnForRun(turns: readonly SquadTurnView[], runHandle: string | null): SquadTurnView | null {
  if (!runHandle) return null;
  return turns.find((turn) => turn.run_handle === runHandle) ?? null;
}

/** Members who finished their part, once each and in the order they were asked. Failed members did not contribute. */
export function contributorsOf(handoffs: readonly SquadHandoffView[]): string[] {
  const seen: string[] = [];
  for (const handoff of handoffs) {
    if (handoff.status === 'failed' || seen.includes(handoff.to_slug)) continue;
    seen.push(handoff.to_slug);
  }
  return seen;
}

const CAPS: readonly SquadCapView[] = ['cap_delegations', 'cap_tokens', 'cap_time', 'cap_credits'];

function capOf(reason: SquadTurnView['termination_reason']): SquadCapView | null {
  return CAPS.find((cap) => cap === reason) ?? null;
}

/** The cap that stopped a stored turn, if one did. Reaching a cap is an outcome, not an error. */
export function stateFromTurn(turn: SquadTurnView): { limit: SquadCapView | null } {
  return { limit: capOf(turn.termination_reason) };
}

// ---------------------------------------------------------------------------
// Live turn: handoff cards and the limit card while the reply streams
// ---------------------------------------------------------------------------

export interface LiveHandoff {
  delegation_id: string;
  from_slug: string;
  to_slug: string;
  task_summary: string;
  parallel_group: number | null;
  status: SquadHandoffStatusView;
  summary: string | null;
  error_code: string | null;
  points: number | null;
}

export interface LiveTurn {
  handoffs: LiveHandoff[];
  limit: { cap: SquadCapView; unfinished: string[] } | null;
}

export const EMPTY_LIVE_TURN: LiveTurn = { handoffs: [], limit: null };

export interface LiveTurnEvent {
  event: string;
  data: unknown;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
const str = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

const RESULT_STATUSES: readonly SquadHandoffStatusView[] = ['done', 'needs_review', 'failed'];

/**
 * Applies one stream event. A payload that is not the contract is ignored,
 * never thrown: a card must not break the reply it belongs to, and the stored
 * turn is the truth on the next load. Updates keep each card where it is, so a
 * result arriving does not move the page.
 */
export function reduceLiveTurn(state: LiveTurn, { event, data }: LiveTurnEvent): LiveTurn {
  const body = record(data);
  if (!body) return state;

  if (event === 'handoff') {
    const id = str(body.delegation_id);
    const from = str(body.from);
    const to = str(body.to);
    const task = str(body.task_summary);
    if (!id || !from || !to || !task) return state;
    if (state.handoffs.some((handoff) => handoff.delegation_id === id)) return state;
    const group = typeof body.parallel_group === 'number' ? body.parallel_group : null;
    return {
      ...state,
      handoffs: [
        ...state.handoffs,
        { delegation_id: id, from_slug: from, to_slug: to, task_summary: task, parallel_group: group, status: 'working', summary: null, error_code: null, points: null },
      ],
    };
  }

  if (event === 'handoff_result') {
    const id = str(body.delegation_id);
    const status = RESULT_STATUSES.find((candidate) => candidate === body.status);
    if (!id || !status || !state.handoffs.some((handoff) => handoff.delegation_id === id)) return state;
    return {
      ...state,
      handoffs: state.handoffs.map((handoff) =>
        handoff.delegation_id === id
          ? {
              ...handoff,
              status,
              summary: str(body.summary),
              error_code: str(body.error_code),
              points: typeof body.points === 'number' ? body.points : handoff.points,
            }
          : handoff,
      ),
    };
  }

  if (event === 'turn_limit') {
    const cap = CAPS.find((candidate) => candidate === body.cap);
    if (!cap) return state;
    const unfinished = Array.isArray(body.unfinished) ? body.unfinished.filter((item): item is string => typeof item === 'string') : [];
    return { ...state, limit: { cap, unfinished } };
  }

  return state;
}
