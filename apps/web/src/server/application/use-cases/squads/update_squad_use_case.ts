import type { UpdateSquadDto } from '@/server/application/dtos/squad_dto';
import {
  assertCanEdit,
  assertNotArchived,
  describeSquad,
  isOwnerOrAdmin,
  loadSquad,
  readRoster,
  requireWorkspace,
  type SquadDeps,
  type SquadDescription,
} from '@/server/application/squads/squad_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ForbiddenError } from '@/server/domain/errors/domain_error';
import { memberSlugs, validateComposition } from '@/server/domain/squads/squad';

export class UpdateSquadUseCase {
  constructor(private readonly deps: SquadDeps) {}

  async execute(squadId: string, dto: UpdateSquadDto, context: RequestContext): Promise<SquadDescription> {
    const { squads, audit, transactions, directory } = this.deps;
    const workspaceId = requireWorkspace(context);
    const squad = await loadSquad(this.deps, context, squadId);
    assertCanEdit(squad, context);

    const changesStatus = dto.status !== undefined && dto.status !== squad.status;
    // `squad.delete` covers archive and restore in the PRD; the route guard is
    // the broader `squad.edit`, so the narrower rule is applied here.
    if (changesStatus && !isOwnerOrAdmin(context)) {
      throw new ForbiddenError('Only an Owner or Admin can archive or restore a squad');
    }
    if (!changesStatus) assertNotArchived(squad);

    const leadChanges = dto.lead_type !== undefined || dto.lead_agent_slug !== undefined;
    const leadType = dto.lead_type ?? squad.lead_type;
    const leadSlug = leadType === 'member' ? (dto.lead_agent_slug ?? squad.lead_agent_slug) : null;
    if (leadChanges) {
      // Only the lead is being decided, so the current members are taken as
      // they are: a member that was disabled since must not block a new lead.
      const current = memberSlugs(squad);
      validateComposition(
        { member_slugs: current, lead_type: leadType, lead_agent_slug: leadSlug },
        current.map((agent_slug) => ({ agent_slug, enabled: true, accessible: true })),
      );
    }
    const leadChanged = leadChanges && (leadType !== squad.lead_type || leadSlug !== squad.lead_agent_slug);

    const fields = (['name', 'goal'] as const).filter((key) => dto[key] !== undefined && dto[key] !== squad[key]);

    const updated = await transactions.run(async () => {
      const next = await squads.update(workspaceId, squad.id, {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.goal !== undefined ? { goal: dto.goal } : {}),
        ...(leadChanges ? { lead_type: leadType, lead_agent_slug: leadSlug } : {}),
        ...(changesStatus
          ? { status: dto.status, archived_at: dto.status === 'archived' ? new Date() : null }
          : {}),
      });
      const base = { context, target_resource_type: 'squad', target_resource_id: squad.id };
      if (fields.length > 0 || (changesStatus && dto.status === 'active')) {
        await audit.log({
          ...base,
          action: 'squad.updated',
          // Field names only, never the new name or goal.
          metadata: { fields: changesStatus && dto.status === 'active' ? [...fields, 'status'] : fields },
        });
      }
      if (leadChanged) {
        await audit.log({
          ...base,
          action: 'squad.lead_changed',
          metadata: { from: squad.lead_agent_slug ?? 'sino', to: leadSlug ?? 'sino' },
        });
      }
      if (changesStatus && dto.status === 'archived') {
        await audit.log({ ...base, action: 'squad.archived' });
      }
      return next;
    });
    return describeSquad(this.deps, updated, context, await readRoster(directory, context));
  }
}
