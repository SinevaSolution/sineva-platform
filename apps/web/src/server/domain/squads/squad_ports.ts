import type { ConversationEntity } from '@/server/domain/entities/conversation';
import type { RequestContext } from '@/server/domain/context/request_context';
import type {
  SquadClaim,
  SquadEntity,
  SquadLeadType,
  SquadLimits,
  SquadRosterEntry,
  SquadStatus,
} from './squad';

export interface NewSquad {
  workspace_id: string;
  name: string;
  goal: string;
  lead_type: SquadLeadType;
  lead_agent_slug: string | null;
  template_slug: string | null;
  limits: SquadLimits | null;
  created_by: string;
  member_slugs: string[];
}

export interface SquadPatch {
  name?: string;
  goal?: string;
  lead_type?: SquadLeadType;
  lead_agent_slug?: string | null;
  limits?: SquadLimits | null;
  status?: SquadStatus;
  archived_at?: Date | null;
}

/** Every method is scoped by workspace: another workspace's squad id is simply not found. */
export interface SquadRepository {
  list(workspaceId: string, filter?: { status?: SquadStatus }): Promise<SquadEntity[]>;
  findById(workspaceId: string, squadId: string): Promise<SquadEntity | null>;
  /** Active squads, for the `squads.max` check. */
  countActive(workspaceId: string): Promise<number>;
  /** The ids among `ids` that are active squads of the workspace (Library scope check). */
  existingActiveIds(workspaceId: string, ids: string[]): Promise<string[]>;
  create(input: NewSquad): Promise<SquadEntity>;
  update(workspaceId: string, squadId: string, patch: SquadPatch): Promise<SquadEntity>;
  /** Replaces the members in the given order; keeps `added_at` and `added_by` of those that stay. */
  replaceMembers(workspaceId: string, squadId: string, memberSlugs: string[], addedBy: string): Promise<SquadEntity>;
  /** Removes the squad and, through the foreign keys, its sessions and turns. */
  delete(workspaceId: string, squadId: string): Promise<void>;
  hasAccessOverride(squadId: string, userId: string): Promise<boolean>;
  setAccessOverride(squadId: string, userId: string, grantedBy: string, granted: boolean): Promise<void>;
}

/** The roster as this person sees it, from the same source as the specialists screen (sineva-ai catalog). */
export interface SquadSpecialistDirectory {
  roster(context: RequestContext): Promise<SquadRosterEntry[]>;
}

/**
 * The tools a member may use in this person's squad: its allowlist, intersected
 * with what the person may do and with the connections they can use. The
 * connections module is not on this base, so the shipped adapter returns none
 * and nothing is ever widened. The connections work replaces the adapter only.
 */
export interface MemberToolPolicy {
  allowedTools(input: { agent_slug: string; context: RequestContext }): Promise<string[]>;
}

export type SquadTurnStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type SquadTerminationReason =
  | 'done'
  | 'cap_delegations'
  | 'cap_tokens'
  | 'cap_time'
  | 'cap_credits'
  | 'error'
  | 'cancelled';
export type SquadHandoffStatus = 'working' | 'done' | 'needs_review' | 'failed';

export interface SquadHandoffEntity {
  delegation_id: string;
  position: number;
  from_slug: string;
  to_slug: string;
  task_summary: string;
  parallel_group: number | null;
  status: SquadHandoffStatus;
  summary: string | null;
  error_code: string | null;
  points: number | null;
}

export interface SquadTurnEntity {
  id: string;
  workspace_id: string;
  squad_id: string;
  conversation_id: string;
  user_id: string;
  run_handle: string;
  lead_slug: string;
  direct_slug: string | null;
  ceiling_points: number | null;
  status: SquadTurnStatus;
  termination_reason: SquadTerminationReason | null;
  delegation_count: number;
  points: number | null;
  created_at: string;
  finished_at: string | null;
  handoffs: SquadHandoffEntity[];
}

export interface NewSquadTurn {
  workspace_id: string;
  squad_id: string;
  conversation_id: string;
  user_id: string;
  run_handle: string;
  lead_slug: string;
  direct_slug: string | null;
  ceiling_points: number | null;
}

export interface SquadTurnRepository {
  /** Idempotent per `run_handle`: a second attach returns the same row. */
  start(input: NewSquadTurn): Promise<SquadTurnEntity>;
  findByRunHandle(runHandle: string): Promise<SquadTurnEntity | null>;
  /** Idempotent per `(turn, delegation_id)`. */
  recordHandoff(
    turnId: string,
    input: { delegation_id: string; from_slug: string; to_slug: string; task_summary: string; parallel_group: number | null },
  ): Promise<void>;
  recordHandoffResult(
    turnId: string,
    input: { delegation_id: string; status: SquadHandoffStatus; summary: string | null; error_code: string | null; points: number | null },
  ): Promise<void>;
  /** Sets the reason a cap stopped the turn; the turn is finished by `finish`. */
  recordLimit(turnId: string, reason: SquadTerminationReason): Promise<void>;
  finish(
    turnId: string,
    input: { status: SquadTurnStatus; termination_reason: SquadTerminationReason | null; delegation_count: number | null; points: number | null },
  ): Promise<void>;
  listByConversation(workspaceId: string, conversationId: string): Promise<SquadTurnEntity[]>;
  listBySquad(
    workspaceId: string,
    squadId: string,
    filter: { user_id?: string; limit: number },
  ): Promise<SquadTurnEntity[]>;
}

/** What the relay needs to start a squad turn upstream. */
export interface SquadTurnPlan {
  squad_id: string;
  claim: SquadClaim;
  budget: { max_credits: number; max_tokens: number };
}

/**
 * The relay's only view of squads (ADR-0044). `prepare` re-checks the squad and
 * the caller and records the turn; `recordFrame` stores handoff events;
 * `finish` closes the turn from the terminal frame.
 */
export interface SquadTurnPort {
  prepare(input: {
    conversation: ConversationEntity;
    run_handle: string;
    agent_slug: string;
    context: RequestContext;
  }): Promise<SquadTurnPlan>;
  recordFrame(input: { run_handle: string; event: string; data: unknown; context: RequestContext }): Promise<void>;
  finish(input: {
    run_handle: string;
    outcome: 'completed' | 'failed' | 'cancelled';
    squad: { termination_reason?: string; delegation_count?: number; points?: number } | null;
  }): Promise<void>;
}
