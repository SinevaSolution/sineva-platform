import type { SquadDescription } from '../application/squads/squad_support';
import type { SquadSessionDetail } from '../application/use-cases/squads/get_squad_session_use_case';
import type { SquadTurnEntity } from '../domain/squads/squad_ports';
import { memberSlugs } from '../domain/squads/squad';
import type { LocalizedSquadTemplate } from '@/shared/squads/templates';
import type { SquadSessionDetailView, SquadTemplateView, SquadTurnView, SquadView } from '@/shared/squad_view';

/** The one place a squad entity becomes wire JSON. The workspace id is left out: the URL carries it. */
export function toSquadView({ squad, attention, my_access, can_edit, ceiling_points }: SquadDescription): SquadView {
  return {
    id: squad.id,
    name: squad.name,
    goal: squad.goal,
    lead_type: squad.lead_type,
    lead_agent_slug: squad.lead_agent_slug,
    template_slug: squad.template_slug,
    status: squad.status,
    members: memberSlugs(squad).map((agent_slug, position) => ({ agent_slug, position })),
    attention,
    my_access,
    can_edit,
    ceiling_points,
    created_at: squad.created_at,
    updated_at: squad.updated_at,
  };
}

export function toSquadTurnView(turn: SquadTurnEntity): SquadTurnView {
  return {
    run_handle: turn.run_handle,
    lead_slug: turn.lead_slug,
    direct_slug: turn.direct_slug,
    ceiling_points: turn.ceiling_points,
    status: turn.status,
    termination_reason: turn.termination_reason,
    delegation_count: turn.delegation_count,
    points: turn.points,
    created_at: turn.created_at,
    finished_at: turn.finished_at,
    handoffs: turn.handoffs.map((handoff) => ({ ...handoff })),
  };
}

export function toSquadSessionDetailView(detail: SquadSessionDetail): SquadSessionDetailView {
  return {
    conversation: detail.conversation,
    messages: detail.messages,
    next_cursor: detail.next_cursor,
    turns: detail.turns.map(toSquadTurnView),
  };
}

export function toSquadTemplateView(template: LocalizedSquadTemplate): SquadTemplateView {
  return {
    slug: template.slug,
    name: template.name,
    goal: template.goal,
    member_slugs: [...template.member_slugs],
    lead_type: template.lead_type,
    starter_prompts: [...template.starter_prompts],
    library_folders: [...template.library_folders],
  };
}
