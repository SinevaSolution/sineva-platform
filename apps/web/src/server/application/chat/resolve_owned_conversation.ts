import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';

/**
 * Loads a conversation and proves the caller owns it. Missing, another
 * member's, an admin's view of someone else's and another workspace's all
 * give the same 404, never 403, so existence is not disclosed (FR-HUB-32).
 */
export async function resolveOwnedConversation(
  conversations: ConversationRepository,
  conversationId: string,
  context: RequestContext,
): Promise<ConversationEntity> {
  const conversation = await conversations.findById(conversationId);
  if (
    !conversation ||
    conversation.workspace_id !== context.workspace_id ||
    conversation.user_id !== context.user_id
  ) {
    throw new NotFoundError('Conversation', conversationId);
  }
  return conversation;
}
