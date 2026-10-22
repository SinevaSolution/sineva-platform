import type { CreateSquadSessionDto } from '@/server/application/dtos/squad_dto';
import {
  assertCanTakeTurn,
  loadOpenSquad,
  type SquadChatDeps,
} from '@/server/application/squads/squad_chat_support';
import { requireWorkspace } from '@/server/application/squads/squad_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';

export class CreateSquadSessionUseCase {
  constructor(private readonly deps: Pick<SquadChatDeps, 'squads' | 'directory' | 'conversations' | 'audit' | 'transactions'>) {}

  async execute(squadId: string, dto: CreateSquadSessionDto, context: RequestContext): Promise<ConversationEntity> {
    const { conversations, audit, transactions } = this.deps;
    const workspaceId = requireWorkspace(context);
    const squad = await loadOpenSquad(this.deps, context, squadId);
    await assertCanTakeTurn(this.deps, squad, context);

    // The session and its audit row commit together, as for any conversation.
    return transactions.run(async () => {
      const created = await conversations.create({
        workspace_id: workspaceId,
        user_id: context.user_id,
        kind: 'squad',
        agent_slug: null,
        squad_id: squad.id,
        title: dto.title ?? null,
        title_source: dto.title ? 'user' : null,
        origin_channel: 'web',
      });
      await audit.log({
        action: 'conversation.created',
        context,
        target_resource_id: created.id,
        target_resource_type: 'conversation',
        metadata: { kind: 'squad', squad_id: squad.id },
      });
      return created;
    });
  }
}
