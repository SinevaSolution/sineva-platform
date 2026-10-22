import { randomUUID } from 'node:crypto';
import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';
import type { MessageRepository } from '@/server/domain/repositories/message_repository';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { CreateMessageDto } from '@/server/application/dtos/conversation_dto';
import { parseMentions } from '@/server/domain/chat/mention_parser';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/server/domain/errors/domain_error';

export interface CreateMessageResult {
  message_id: string;
  run_id: string;
  conversation_id: string;
  status: string;
}

export class CreateMessageUseCase {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
  ) {}

  async execute(
    conversationId: string,
    dto: CreateMessageDto,
    context: RequestContext,
  ): Promise<CreateMessageResult> {
    const conversation = await this.conversationRepository.findById(conversationId);

    // Private ownership check (FR-HUB-32)
    if (
      !conversation ||
      conversation.workspace_id !== context.workspace_id ||
      conversation.user_id !== context.user_id
    ) {
      throw new NotFoundError('Conversation', conversationId);
    }

    // A squad session has its own message route: it checks squad access, state
    // and who may be addressed before anything is stored (ADR-0044).
    if (conversation.kind === 'squad') {
      throw new NotFoundError('Conversation', conversationId);
    }

    // Idempotency: repeated client_message_id returns existing record (API-3, FR-HUB-20)
    if (dto.client_message_id) {
      const existing = await this.messageRepository.findByClientMessageId(
        conversationId,
        dto.client_message_id,
      );
      if (existing) {
        return {
          message_id: existing.id,
          run_id: existing.run_id ?? '',
          conversation_id: conversationId,
          status: existing.status,
        };
      }
    }

    // Re-parse mentions server-side against canonical specialists (FR-HUB-08)
    // Client-provided hints are ignored to prevent forged mentions.
    const parsed = parseMentions(dto.content);

    let targetSpecialist: string;

    if (conversation.kind === 'room') {
      const pinnedSlug = conversation.agent_slug;
      if (!pinnedSlug) {
        throw new ValidationError('Corrupted room conversation without pinned specialist', [
          {
            field: 'agent_slug',
            code: 'missing_pinned_agent',
            detail: 'Corrupted room conversation without pinned specialist',
          },
        ]);
      }

      // Room conversation pins agent_slug; reject message addressing another specialist
      if (
        parsed.leadingSpecialistSlug &&
        parsed.leadingSpecialistSlug !== pinnedSlug
      ) {
        throw new ValidationError(
          `Room is dedicated to specialist '${pinnedSlug}'. Cannot address '${parsed.leadingSpecialistSlug}' in this room.`,
          [
            {
              field: 'content',
              code: 'room_specialist_mismatch',
              detail: `Cannot message specialist '${parsed.leadingSpecialistSlug}' in a room pinned to '${pinnedSlug}'`,
            },
          ],
        );
      }

      targetSpecialist = pinnedSlug;
    } else {
      // Hub conversation: leading mention selects specialist; default is 'sino' (D-M0-8)
      targetSpecialist = parsed.leadingSpecialistSlug ?? 'sino';
    }

    // Specialist scoping check: if member has restricted specialists, verify access (FR-AUTH-19)
    if (
      context.allowed_specialists &&
      context.allowed_specialists.length > 0 &&
      targetSpecialist !== 'sino'
    ) {
      if (!context.allowed_specialists.includes(targetSpecialist)) {
        throw new ForbiddenError(
          `Access to specialist '${targetSpecialist}' is not permitted for your member account`,
        );
      }
    }

    // Allocate run handle per D-M0-3
    const runId = `run_${randomUUID()}`;

    // Store user message
    const message = await this.messageRepository.create({
      conversation_id: conversationId,
      role: 'user',
      agent_slug: targetSpecialist,
      content: dto.content,
      mentions: parsed.mentions,
      status: 'completed',
      run_id: runId,
      channel: 'web',
      client_message_id: dto.client_message_id ?? null,
    });

    // Update last_message_at on conversation
    await this.conversationRepository.updateLastMessageAt(conversationId, new Date());

    return {
      message_id: message.id,
      run_id: runId,
      conversation_id: conversationId,
      status: message.status,
    };
  }
}
