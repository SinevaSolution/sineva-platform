import type { CreateSquadDto } from '@/server/application/dtos/squad_dto';
import {
  describeSquad,
  requireWorkspace,
  type SquadDeps,
  type SquadDescription,
} from '@/server/application/squads/squad_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ENTITLEMENT_KEYS } from '@/server/domain/entitlements/entitlements';
import { validateComposition } from '@/server/domain/squads/squad';

export class CreateSquadUseCase {
  constructor(private readonly deps: SquadDeps) {}

  async execute(dto: CreateSquadDto, context: RequestContext): Promise<SquadDescription> {
    const { squads, directory, audit, entitlements, transactions } = this.deps;
    const workspaceId = requireWorkspace(context);

    // Both checks run before anything is written. `squads.max` is asked for
    // the count after this create (D-M4-3); `open` mode ignores both.
    await entitlements.assert(workspaceId, ENTITLEMENT_KEYS.SQUADS);
    await entitlements.assert(workspaceId, ENTITLEMENT_KEYS.SQUADS_MAX, (await squads.countActive(workspaceId)) + 1);

    // A failed roster read (503 or 502) stops the create: a squad must never
    // be built from an invented list of who is available.
    const roster = await directory.roster(context);
    validateComposition(
      { member_slugs: dto.member_slugs, lead_type: dto.lead_type, lead_agent_slug: dto.lead_agent_slug ?? null },
      roster,
    );

    // The squad and its audit row commit together.
    const squad = await transactions.run(async () => {
      const created = await squads.create({
        workspace_id: workspaceId,
        name: dto.name,
        goal: dto.goal,
        lead_type: dto.lead_type,
        lead_agent_slug: dto.lead_type === 'member' ? (dto.lead_agent_slug ?? null) : null,
        template_slug: dto.template_slug ?? null,
        limits: null,
        created_by: context.user_id,
        member_slugs: dto.member_slugs,
      });
      await audit.log({
        action: 'squad.created',
        context,
        target_resource_type: 'squad',
        target_resource_id: created.id,
        // Ids and counts only: the goal text stays out of the audit log.
        metadata: { member_count: created.members.length, lead_type: created.lead_type, template_slug: created.template_slug },
      });
      return created;
    });
    return describeSquad(this.deps, squad, context, roster);
  }
}
