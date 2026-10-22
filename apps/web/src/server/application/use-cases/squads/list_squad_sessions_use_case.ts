import { loadOpenSquad, type SquadChatDeps } from '@/server/application/squads/squad_chat_support';
import { requireWorkspace } from '@/server/application/squads/squad_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';

export class ListSquadSessionsUseCase {
  constructor(private readonly deps: Pick<SquadChatDeps, 'squads' | 'conversations'>) {}

  /** The caller's own sessions of this squad (sessions are private, FR-HUB-32). */
  async execute(squadId: string, context: RequestContext): Promise<{ items: ConversationEntity[]; next_cursor: string | null }> {
    const squad = await loadOpenSquad(this.deps, context, squadId);
    return this.deps.conversations.list({
      workspace_id: requireWorkspace(context),
      user_id: context.user_id,
      kind: 'squad',
      squad_id: squad.id,
      limit: 50,
    });
  }
}
