import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';
import type { MessageRepository } from '@/server/domain/repositories/message_repository';
import type { MessageCardRepository } from '@/server/domain/repositories/message_card_repository';
import type { CardValidator } from '@/server/domain/chat/card_validator';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { MessageEntity } from '@/server/domain/entities/message';
import type { MessageCardEntity } from '@/server/domain/entities/message_card';
import type { ListMessagesQueryDto } from '@/server/application/dtos/conversation_dto';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { MessageCardView } from '@/shared/chat_view';

export type MessageWithCards = MessageEntity & { cards: MessageCardView[] };

export class ListMessagesUseCase {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly cardRepository: MessageCardRepository,
    private readonly cardValidator: CardValidator,
  ) {}

  async execute(
    conversationId: string,
    dto: ListMessagesQueryDto,
    context: RequestContext,
  ): Promise<{ items: MessageWithCards[]; next_cursor: string | null }> {
    const conversation = await this.conversationRepository.findById(conversationId);

    // Private ownership check (FR-HUB-32). It comes first, so nothing about a
    // card is read for a conversation the caller cannot see.
    if (
      !conversation ||
      conversation.workspace_id !== context.workspace_id ||
      conversation.user_id !== context.user_id
    ) {
      throw new NotFoundError('Conversation', conversationId);
    }

    const page = await this.messageRepository.listByConversation({
      conversation_id: conversationId,
      cursor: dto.cursor,
      limit: dto.limit,
    });

    // One query for the whole page, scoped by the workspace of the session.
    const cards = await this.cardRepository.listByMessageIds(
      context.workspace_id,
      page.items.map((message) => message.id),
    );
    const byMessage = new Map<string, MessageCardView[]>();
    for (const card of cards) {
      const list = byMessage.get(card.message_id) ?? [];
      list.push(this.toView(card));
      byMessage.set(card.message_id, list);
    }

    return {
      items: page.items.map((message) => ({ ...message, cards: byMessage.get(message.id) ?? [] })),
      next_cursor: page.next_cursor,
    };
  }

  /**
   * Stored cards are validated again on read (FR-AX-13: validated and upcast).
   * That is what upcasts an N-1 row, and it keeps a row whose schema changed
   * or was removed from reaching the browser as a card: it degrades to its
   * fallback text, the same as a card rejected live.
   */
  private toView(card: MessageCardEntity): MessageCardView {
    const base = {
      id: card.id,
      message_id: card.message_id,
      position: card.position,
      card_type: card.card_type,
      provider_slug: card.provider_slug,
      approval_id: card.approval_id,
      fallback_text: card.fallback_text,
      version: card.version,
    };
    const rejected = (code: string): MessageCardView => ({
      ...base,
      schema_version: card.schema_version,
      state: 'failed',
      validation_status: 'rejected',
      rejected_code: code,
      data: {},
      actions: [],
    });

    if (card.validation_status === 'rejected') return rejected(card.rejected_code ?? 'rejected');

    const check = this.cardValidator.validate({
      card_type: card.card_type,
      schema_version: card.schema_version,
      data: card.data,
      actions: card.actions,
      // The account label is not stored, so the stored provider cannot be rebuilt here.
      provider: null,
      fallback_text: card.fallback_text,
    });
    if (!check.ok) return rejected(check.code);

    return {
      ...base,
      card_type: check.card.card_type,
      schema_version: check.card.schema_version,
      state: card.state,
      validation_status: 'valid',
      rejected_code: null,
      data: check.card.data,
      actions: check.card.actions,
    };
  }
}
