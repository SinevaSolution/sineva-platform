import type { SetSquadAccessDto } from '@/server/application/dtos/squad_dto';
import { loadSquad, requireWorkspace, type SquadDeps } from '@/server/application/squads/squad_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';

export class SetSquadAccessUseCase {
  constructor(private readonly deps: Pick<SquadDeps, 'squads' | 'audit' | 'transactions' | 'members'>) {}

  /**
   * Lets one person open a squad although they cannot use every member
   * specialist (FR-SQD-18, D-M4-12). The route is limited to Owner and Admin
   * (`squad.access.override`); the person must belong to this workspace.
   */
  async execute(squadId: string, dto: SetSquadAccessDto, context: RequestContext): Promise<{ user_id: string; granted: boolean }> {
    const { squads, audit, transactions, members } = this.deps;
    const workspaceId = requireWorkspace(context);
    const squad = await loadSquad(this.deps, context, squadId);
    if (!(await members.findMembership(workspaceId, dto.user_id))) {
      throw new NotFoundError('Member', dto.user_id);
    }
    await transactions.run(async () => {
      await squads.setAccessOverride(squad.id, dto.user_id, context.user_id, dto.granted);
      await audit.log({
        action: 'squad.access_overridden',
        context,
        target_resource_type: 'squad',
        target_resource_id: squad.id,
        metadata: { granted: dto.granted, target_user_id: dto.user_id },
      });
    });
    return { user_id: dto.user_id, granted: dto.granted };
  }
}
