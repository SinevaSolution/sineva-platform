import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';
import type { MessageRepository } from '@/server/domain/repositories/message_repository';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { MessageEntity } from '@/server/domain/entities/message';
import type { ListMessagesQueryDto } from '@/server/application/dtos/conversation_dto';
import { NotFoundError } from '@/server/domain/errors/domain_error';

export class ListMessagesUseCase {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
  ) {}

  async execute(
    conversationId: string,
    dto: ListMessagesQueryDto,
    context: RequestContext,
  ): Promise<{ items: MessageEntity[]; next_cursor: string | null }> {
    const conversation = await this.conversationRepository.findById(conversationId);

    // Private ownership check (FR-HUB-32)
    if (
      !conversation ||
      conversation.workspace_id !== context.workspace_id ||
      conversation.user_id !== context.user_id
    ) {
      throw new NotFoundError('Conversation', conversationId);
    }

    return this.messageRepository.listByConversation({
      conversation_id: conversationId,
      cursor: dto.cursor,
      limit: dto.limit,
    });
  }
}
