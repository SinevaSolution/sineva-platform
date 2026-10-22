import type { SetSquadMembersDto } from '@/server/application/dtos/squad_dto';
import {
  assertCanEdit,
  assertNotArchived,
  describeSquad,
  loadSquad,
  requireWorkspace,
  type SquadDeps,
  type SquadDescription,
} from '@/server/application/squads/squad_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { memberSlugs, validateComposition } from '@/server/domain/squads/squad';

export class SetSquadMembersUseCase {
  constructor(private readonly deps: SquadDeps) {}

  async execute(squadId: string, dto: SetSquadMembersDto, context: RequestContext): Promise<SquadDescription> {
    const { squads, audit, transactions, directory } = this.deps;
    const workspaceId = requireWorkspace(context);
    const squad = await loadSquad(this.deps, context, squadId);
    assertCanEdit(squad, context);
    assertNotArchived(squad);

    const before = memberSlugs(squad);
    const leadType = dto.lead_type ?? squad.lead_type;
    const leadSlug = leadType === 'member' ? (dto.lead_agent_slug ?? squad.lead_agent_slug) : null;

    // Only the specialists being added need to be turned on and usable by the
    // editor. A member who stays is accepted as it is: if it was disabled
    // since, the squad shows Needs attention and the editor can remove it.
    const roster = await directory.roster(context);
    const stays = new Set(before);
    validateComposition(
      { member_slugs: dto.member_slugs, lead_type: leadType, lead_agent_slug: leadSlug },
      [
        ...roster.filter((entry) => !stays.has(entry.agent_slug)),
        ...before.map((agent_slug) => ({ agent_slug, enabled: true, accessible: true })),
      ],
    );

    const added = dto.member_slugs.filter((slug) => !before.includes(slug));
    const removed = before.filter((slug) => !dto.member_slugs.includes(slug));
    const leadChanged = leadType !== squad.lead_type || leadSlug !== squad.lead_agent_slug;

    const updated = await transactions.run(async () => {
      if (leadChanged) {
        await squads.update(workspaceId, squad.id, { lead_type: leadType, lead_agent_slug: leadSlug });
      }
      const next = await squads.replaceMembers(workspaceId, squad.id, dto.member_slugs, context.user_id);
      const base = { context, target_resource_type: 'squad', target_resource_id: squad.id };
      for (const agent_slug of added) {
        await audit.log({ ...base, action: 'squad.member_added', metadata: { agent_slug } });
      }
      for (const agent_slug of removed) {
        await audit.log({ ...base, action: 'squad.member_removed', metadata: { agent_slug } });
      }
      if (leadChanged) {
        await audit.log({
          ...base,
          action: 'squad.lead_changed',
          metadata: { from: squad.lead_agent_slug ?? 'sino', to: leadSlug ?? 'sino' },
        });
      }
      return next;
    });
    return describeSquad(this.deps, updated, context, roster);
  }
}
