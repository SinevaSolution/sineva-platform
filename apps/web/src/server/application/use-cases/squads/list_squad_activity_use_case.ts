import type { SquadActivityQueryDto } from '@/server/application/dtos/squad_dto';
import { loadOpenSquad, type SquadChatDeps } from '@/server/application/squads/squad_chat_support';
import { isOwnerOrAdmin, requireWorkspace } from '@/server/application/squads/squad_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { SquadTurnEntity } from '@/server/domain/squads/squad_ports';

export class ListSquadActivityUseCase {
  constructor(private readonly deps: Pick<SquadChatDeps, 'squads' | 'turns'>) {}

  /**
   * Turns with their per-member split (FR-SQD-14). Sessions are private, so a
   * person sees their own turns; Owner and Admin see every turn of the squad.
   * Turn rows hold facts only, never message text.
   */
  async execute(squadId: string, query: SquadActivityQueryDto, context: RequestContext): Promise<{ items: SquadTurnEntity[] }> {
    const squad = await loadOpenSquad(this.deps, context, squadId);
    const items = await this.deps.turns.listBySquad(requireWorkspace(context), squad.id, {
      limit: query.limit,
      ...(isOwnerOrAdmin(context) ? {} : { user_id: context.user_id }),
    });
    return { items };
  }
}
