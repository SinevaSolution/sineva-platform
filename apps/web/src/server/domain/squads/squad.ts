import type { RequestContext } from '@/server/domain/context/request_context';
import type { UserRole } from '@/server/domain/entities/user';
import { ValidationError } from '@/server/domain/errors/domain_error';

// Squad rules (ADR-0043). Pure: no framework, no I/O.

export const SQUAD_MEMBERS_MIN = 2;
export const SQUAD_MEMBERS_MAX = 5;
export const SQUAD_GOAL_MAX = 500;
export const SQUAD_NAME_MAX = 60;

export type SquadLeadType = 'sino' | 'member';
export type SquadStatus = 'active' | 'archived';

export interface SquadMemberEntity {
  agent_slug: string;
  position: number;
  added_by: string | null;
  added_at: string;
}

/** Per-squad overrides of the turn bounds. Each value may only tighten the hard caps. */
export interface SquadLimits {
  max_delegations?: number;
  max_parallel?: number;
  max_wall_ms?: number;
  max_tokens?: number;
  max_credits?: number;
}

export interface SquadEntity {
  id: string;
  workspace_id: string;
  name: string;
  goal: string;
  lead_type: SquadLeadType;
  lead_agent_slug: string | null;
  template_slug: string | null;
  status: SquadStatus;
  limits: SquadLimits | null;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  members: SquadMemberEntity[];
}

/** What one squad turn may spend. Enforced by sineva-ai in code; the platform only states it. */
export interface SquadBounds {
  max_delegations: number;
  max_parallel: number;
  max_wall_ms: number;
  max_tokens: number;
  max_credits: number;
}

/** Hard caps of FR-SQD-13. A squad's own limits can lower them, never raise them. */
export const SQUAD_HARD_CAPS = { max_delegations: 4, max_parallel: 2 } as const;

/**
 * Starting values (D-M4-11, default, unconfirmed): wall time, token and points
 * ceilings are not measured yet. `max_credits` is in points, the customer-facing unit.
 */
export const SQUAD_STARTER_BOUNDS: SquadBounds = {
  max_delegations: SQUAD_HARD_CAPS.max_delegations,
  max_parallel: SQUAD_HARD_CAPS.max_parallel,
  max_wall_ms: 90_000,
  max_tokens: 60_000,
  max_credits: 40,
};

export function boundsFor(squad: Pick<SquadEntity, 'limits'>): SquadBounds {
  const limits = squad.limits ?? {};
  const lower = (value: number | undefined, base: number) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(value, base) : base;
  return {
    max_delegations: lower(limits.max_delegations, SQUAD_STARTER_BOUNDS.max_delegations),
    max_parallel: lower(limits.max_parallel, SQUAD_STARTER_BOUNDS.max_parallel),
    max_wall_ms: lower(limits.max_wall_ms, SQUAD_STARTER_BOUNDS.max_wall_ms),
    max_tokens: lower(limits.max_tokens, SQUAD_STARTER_BOUNDS.max_tokens),
    max_credits: lower(limits.max_credits, SQUAD_STARTER_BOUNDS.max_credits),
  };
}

/** The upper end of a lead-routed turn, shown as "Up to N points" (FR-SQD-14). */
export function turnCeilingPoints(squad: Pick<SquadEntity, 'limits'>): number {
  return boundsFor(squad).max_credits;
}

export function leadSlugOf(squad: Pick<SquadEntity, 'lead_type' | 'lead_agent_slug'>): string {
  return squad.lead_type === 'member' && squad.lead_agent_slug ? squad.lead_agent_slug : 'sino';
}

export function memberSlugs(squad: Pick<SquadEntity, 'members'>): string[] {
  return [...squad.members].sort((a, b) => a.position - b.position).map((member) => member.agent_slug);
}

/** One specialist as the roster knows it for this person. */
export interface SquadRosterEntry {
  agent_slug: string;
  /** Turned on in the workspace and released. */
  enabled: boolean;
  /** The person's own specialist scope lets them use it. */
  accessible: boolean;
}

export interface SquadComposition {
  member_slugs: readonly string[];
  lead_type: SquadLeadType;
  lead_agent_slug: string | null;
}

function invalid(code: string, field: string, detail: string): ValidationError {
  return new ValidationError(detail, [{ code, field, detail }]);
}

/**
 * Members 2 to 5, no duplicates, each enabled in the workspace and usable by
 * the person saving, and a lead that is Sino or one of the members. A squad
 * is never a member: members are specialist slugs, so nesting cannot be
 * expressed (FR-SQD-06).
 */
export function validateComposition(composition: SquadComposition, roster: readonly SquadRosterEntry[]): void {
  const slugs = composition.member_slugs;
  if (new Set(slugs).size !== slugs.length) {
    throw invalid('squad_member_duplicate', 'member_slugs', 'A specialist can be in a squad once');
  }
  if (slugs.length < SQUAD_MEMBERS_MIN || slugs.length > SQUAD_MEMBERS_MAX) {
    throw invalid(
      'squad_members_count',
      'member_slugs',
      `A squad has ${SQUAD_MEMBERS_MIN} to ${SQUAD_MEMBERS_MAX} members, got ${slugs.length}`,
    );
  }
  const bySlug = new Map(roster.map((entry) => [entry.agent_slug, entry]));
  for (const slug of slugs) {
    const entry = bySlug.get(slug);
    if (!entry || !entry.enabled || !entry.accessible) {
      throw invalid('squad_member_unavailable', 'member_slugs', `Specialist '${slug}' cannot be added`);
    }
  }
  if (composition.lead_type === 'member') {
    if (!composition.lead_agent_slug || !slugs.includes(composition.lead_agent_slug)) {
      throw invalid('squad_lead_invalid', 'lead_agent_slug', 'The lead must be Sino or a member of the squad');
    }
  } else if (composition.lead_agent_slug) {
    throw invalid('squad_lead_invalid', 'lead_agent_slug', 'Sino leads without a named lead specialist');
  }
}

export type SquadAttentionReason = 'member_disabled' | 'lead_removed' | 'connection_missing';

export interface SquadAttention {
  reason: SquadAttentionReason;
  agent_slug: string | null;
}

/**
 * What stops a squad from taking turns (FR-SQD-26). Null roster means the
 * roster could not be read: the caller reports "could not check" instead of
 * claiming all is well. A missing required connection is a seam for the
 * connections work and is never reported yet.
 */
export function computeAttention(
  squad: Pick<SquadEntity, 'members' | 'lead_type' | 'lead_agent_slug' | 'status'>,
  roster: readonly SquadRosterEntry[] | null,
): SquadAttention[] | null {
  if (squad.status === 'archived') return [];
  if (roster === null) return null;
  const bySlug = new Map(roster.map((entry) => [entry.agent_slug, entry]));
  const issues: SquadAttention[] = [];
  const slugs = memberSlugs(squad);
  for (const slug of slugs) {
    if (!bySlug.get(slug)?.enabled) issues.push({ reason: 'member_disabled', agent_slug: slug });
  }
  if (squad.lead_type === 'member' && (!squad.lead_agent_slug || !slugs.includes(squad.lead_agent_slug))) {
    issues.push({ reason: 'lead_removed', agent_slug: squad.lead_agent_slug });
  }
  return issues;
}

/** The person's own specialist scope, role aside. Viewers read squads, so role is not part of it. */
export function canUseSpecialist(context: Pick<RequestContext, 'specialist_scope' | 'allowed_specialists'>, slug: string): boolean {
  return context.specialist_scope !== 'selected' || (context.allowed_specialists ?? []).includes(slug);
}

/** FR-SQD-18: every member must be usable by the person, unless an override was granted. */
export function canOpenSquad(
  squad: Pick<SquadEntity, 'members'>,
  context: Pick<RequestContext, 'specialist_scope' | 'allowed_specialists'>,
  overridden: boolean,
): boolean {
  return overridden || squad.members.every((member) => canUseSpecialist(context, member.agent_slug));
}

/** `squad.edit` is `limited` for a Member: only their own squads (PRD permission table). */
export function canEditSquad(role: UserRole | undefined, userId: string, squad: Pick<SquadEntity, 'created_by'>): boolean {
  if (role === 'owner' || role === 'admin') return true;
  return role === 'member' && squad.created_by === userId;
}

/** A squad that cannot take a turn: archived, or something it needs is gone. */
export function turnBlockReason(
  squad: Pick<SquadEntity, 'status'>,
  attention: readonly SquadAttention[] | null,
): 'archived' | 'needs_attention' | null {
  if (squad.status === 'archived') return 'archived';
  return attention && attention.length > 0 ? 'needs_attention' : null;
}

/** The squad claim of the signed context (ADR-0044). Built from stored data only, never from the goal text. */
export interface SquadClaim {
  squad_id: string;
  lead_slug: string;
  members: Array<{ agent_slug: string; allowed_tools: string[]; approval_policy: string; tier: string }>;
  library_principals: string[];
  memory_namespace: string;
  bounds: SquadBounds;
}

/** Until the autonomy and skills work exist every member asks before a write and works at the read-and-draft tier. */
export const SQUAD_MEMBER_APPROVAL_POLICY = 'ask_for_writes';
export const SQUAD_MEMBER_TIER = 'read_draft';

export function buildSquadClaim(
  squad: SquadEntity,
  toolsBySlug: Readonly<Record<string, readonly string[]>>,
): SquadClaim {
  return {
    squad_id: squad.id,
    lead_slug: leadSlugOf(squad),
    members: memberSlugs(squad).map((slug) => ({
      agent_slug: slug,
      allowed_tools: [...(toolsBySlug[slug] ?? [])],
      approval_policy: SQUAD_MEMBER_APPROVAL_POLICY,
      tier: SQUAD_MEMBER_TIER,
    })),
    library_principals: ['squad:' + squad.id, 'workspace'].sort(),
    memory_namespace: `squad:${squad.id}`,
    bounds: boundsFor(squad),
  };
}
