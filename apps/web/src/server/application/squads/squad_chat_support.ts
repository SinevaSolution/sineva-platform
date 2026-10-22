import {
  assertCanOpen,
  loadSquad,
  readRoster,
  requireWorkspace,
  type SquadDeps,
} from '@/server/application/squads/squad_support';
import type { ListMessagesUseCase } from '@/server/application/use-cases/chat/list_messages_use_case';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import { NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';
import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';
import type { MessageRepository } from '@/server/domain/repositories/message_repository';
import { computeAttention, turnBlockReason, type SquadEntity } from '@/server/domain/squads/squad';
import type { SquadTurnRepository } from '@/server/domain/squads/squad_ports';

export interface SquadChatDeps extends Pick<SquadDeps, 'squads' | 'directory' | 'audit' | 'transactions'> {
  conversations: ConversationRepository;
  messages: MessageRepository;
  turns: SquadTurnRepository;
  listMessages: Pick<ListMessagesUseCase, 'execute'>;
}

/** A squad the person may open: a missing or foreign squad is a 404, a squad they cannot use is a 403 (Ask an admin). */
export async function loadOpenSquad(deps: Pick<SquadChatDeps, 'squads'>, context: RequestContext, squadId: string): Promise<SquadEntity> {
  const squad = await loadSquad(deps, context, squadId);
  await assertCanOpen(deps, squad, context);
  return squad;
}

/**
 * New turns need an active squad with nothing missing. When the roster cannot
 * be read the check cannot say "needs attention", so the turn is allowed to
 * try: an unreachable sineva-ai then fails honestly at the relay.
 */
export async function assertCanTakeTurn(
  deps: Pick<SquadChatDeps, 'directory'>,
  squad: SquadEntity,
  context: RequestContext,
): Promise<void> {
  const attention = computeAttention(squad, await readRoster(deps.directory, context));
  const reason = turnBlockReason(squad, attention);
  if (reason) {
    const code = reason === 'archived' ? 'squad_archived' : 'squad_needs_attention';
    const detail = reason === 'archived' ? 'Archived squads are read-only' : 'Something this squad needs is missing';
    throw new ValidationError(detail, [{ code, field: 'squad_id', detail }]);
  }
}

/** The caller's own session of this squad. Every other case is the same 404 (FR-HUB-32). */
export async function loadOwnedSession(
  deps: Pick<SquadChatDeps, 'conversations'>,
  context: RequestContext,
  squadId: string,
  sessionId: string,
): Promise<ConversationEntity> {
  const conversation = await deps.conversations.findById(sessionId);
  if (
    !conversation ||
    conversation.kind !== 'squad' ||
    conversation.squad_id !== squadId ||
    conversation.workspace_id !== requireWorkspace(context) ||
    conversation.user_id !== context.user_id
  ) {
    throw new NotFoundError('Squad session', sessionId);
  }
  return conversation;
}
