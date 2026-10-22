import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import type { ListConversationsQueryDto } from '@/server/application/dtos/conversation_dto';
import { ValidationError } from '@/server/domain/errors/domain_error';

export class ListConversationsUseCase {
  constructor(private readonly conversationRepository: ConversationRepository) {}

  async execute(
    dto: ListConversationsQueryDto,
    context: RequestContext,
  ): Promise<{ items: ConversationEntity[]; next_cursor: string | null }> {
    if (!context.workspace_id) {
      throw new ValidationError('Workspace context is required', [
        { field: 'workspace_id', code: 'required', detail: 'Workspace context is required' },
      ]);
    }

    return this.conversationRepository.list({
      workspace_id: context.workspace_id,
      user_id: context.user_id,
      kind: dto.kind,
      agent_slug: dto.agent_slug,
      cursor: dto.cursor,
      limit: dto.limit,
    });
  }
}
