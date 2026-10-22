import type { ListWorkspaceSpecialistsUseCase } from '@/server/application/use-cases/list_workspace_specialists_use_case';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { SquadRosterEntry } from '@/server/domain/squads/squad';
import type { SquadSpecialistDirectory } from '@/server/domain/squads/squad_ports';

/**
 * The squad roster is the specialists screen's roster: sineva-ai's catalog
 * merged with the manifest, and a failure to read it propagates (503 or 502),
 * so a squad is never validated against an invented list (ADR-0024).
 */
export class RosterSquadSpecialistDirectory implements SquadSpecialistDirectory {
  constructor(private readonly roster_: Pick<ListWorkspaceSpecialistsUseCase, 'execute'>) {}

  async roster(context: RequestContext): Promise<SquadRosterEntry[]> {
    const { items } = await this.roster_.execute({}, context);
    return items.map((item) => ({
      agent_slug: item.agent_slug,
      // Released and turned on. A coming-soon specialist is never a member.
      enabled: item.enabled && item.status === 'live',
      accessible: item.my_access === 'available',
    }));
  }
}
