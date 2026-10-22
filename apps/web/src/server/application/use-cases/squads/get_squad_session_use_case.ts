import { loadOpenSquad, loadOwnedSession, type SquadChatDeps } from '@/server/application/squads/squad_chat_support';
import { requireWorkspace } from '@/server/application/squads/squad_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import type { SquadTurnEntity } from '@/server/domain/squads/squad_ports';

type Messages = Awaited<ReturnType<SquadChatDeps['listMessages']['execute']>>;

export interface SquadSessionDetail {
  conversation: ConversationEntity;
  messages: Messages['items'];
  next_cursor: Messages['next_cursor'];
  /** One per run, with its handoffs, so handoff cards remain after completion and reload (FR-SQD-11). */
  turns: SquadTurnEntity[];
}

export class GetSquadSessionUseCase {
  constructor(private readonly deps: Pick<SquadChatDeps, 'squads' | 'conversations' | 'turns' | 'listMessages'>) {}

  async execute(squadId: string, sessionId: string, context: RequestContext): Promise<SquadSessionDetail> {
    const squad = await loadOpenSquad(this.deps, context, squadId);
    const conversation = await loadOwnedSession(this.deps, context, squad.id, sessionId);
    const page = await this.deps.listMessages.execute(conversation.id, { limit: 100 }, context);
    const turns = await this.deps.turns.listByConversation(requireWorkspace(context), conversation.id);
    return { conversation, messages: page.items, next_cursor: page.next_cursor, turns };
  }
}
