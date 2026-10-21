import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import { NotFoundError } from '@/server/domain/errors/domain_error';

export class GetConversationUseCase {
  constructor(private readonly conversationRepository: ConversationRepository) {}

  async execute(
    conversationId: string,
    context: RequestContext,
  ): Promise<ConversationEntity> {
    const conversation = await this.conversationRepository.findById(conversationId);

    // Strict private ownership (FR-HUB-32):
    // Even other members, admins, or owners in the same workspace receive 404.
    // Cross-workspace requests also receive 404.
    if (
      !conversation ||
      conversation.workspace_id !== context.workspace_id ||
      conversation.user_id !== context.user_id
    ) {
      throw new NotFoundError('Conversation', conversationId);
    }

    return conversation;
  }
}
