import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import type { MessageEntity } from '@/server/domain/entities/message';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';
import type { MessageRepository } from '@/server/domain/repositories/message_repository';

export const RUN_HANDLE_PREFIX = 'run_';

export interface OwnedRun {
  userMessage: MessageEntity;
  conversation: ConversationEntity;
}

/**
 * Resolves a run handle to its user message and conversation and proves the
 * caller owns it. Every failure is the same 404, so a handle from another
 * user or workspace cannot be told apart from one that never existed
 * (FR-HUB-32, FR-AUTH-24). Runs before any upstream call.
 */
export async function resolveOwnedRun(
  deps: { conversations: ConversationRepository; messages: MessageRepository },
  runHandle: string,
  context: RequestContext,
): Promise<OwnedRun> {
  if (!runHandle.startsWith(RUN_HANDLE_PREFIX)) {
    throw new NotFoundError('Run', runHandle);
  }
  const userMessage = await deps.messages.findUserMessageByRunId(runHandle);
  if (!userMessage) throw new NotFoundError('Run', runHandle);

  const conversation = await deps.conversations.findById(userMessage.conversation_id);
  if (
    !conversation ||
    conversation.workspace_id !== context.workspace_id ||
    conversation.user_id !== context.user_id
  ) {
    throw new NotFoundError('Run', runHandle);
  }
  return { userMessage, conversation };
}
