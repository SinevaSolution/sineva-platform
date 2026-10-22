import { loadSquad, requireWorkspace, type SquadDeps } from '@/server/application/squads/squad_support';
import type { RequestContext } from '@/server/domain/context/request_context';

export class DeleteSquadUseCase {
  constructor(private readonly deps: Pick<SquadDeps, 'squads' | 'audit' | 'transactions'>) {}

  /**
   * Removes the squad and, through the foreign keys, its chat sessions and
   * turns. Workflows and routines that point at a squad are not in this base;
   * they show Needs attention for an archived squad (FR-SQD-05), which is why
   * Archive is the everyday action and Delete the deliberate one.
   */
  async execute(squadId: string, context: RequestContext): Promise<{ id: string; deleted: true }> {
    const { squads, audit, transactions } = this.deps;
    const workspaceId = requireWorkspace(context);
    const squad = await loadSquad(this.deps, context, squadId);
    await transactions.run(async () => {
      await squads.delete(workspaceId, squad.id);
      await audit.log({
        action: 'squad.deleted',
        context,
        target_resource_type: 'squad',
        target_resource_id: squad.id,
        metadata: { member_count: squad.members.length, status: squad.status },
      });
    });
    return { id: squad.id, deleted: true };
  }
}
