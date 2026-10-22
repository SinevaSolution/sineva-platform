import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import type { CreateConversationDto } from '@/server/application/dtos/conversation_dto';
import { ValidationError } from '@/server/domain/errors/domain_error';
import { noTransaction, type TransactionRunner } from '@/server/domain/transactions/transaction_runner';

export class CreateConversationUseCase {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly auditLogger: AuditLogger,
    private readonly transactions: TransactionRunner = noTransaction,
  ) {}

  async execute(
    dto: CreateConversationDto,
    context: RequestContext,
  ): Promise<ConversationEntity> {
    if (!context.workspace_id) {
      throw new ValidationError('Workspace context is required', [
        { field: 'workspace_id', code: 'required', detail: 'Workspace context is required' },
      ]);
    }

    const workspaceId = context.workspace_id;

    // The conversation and its audit row commit together.
    const conversation = await this.transactions.run(async () => {
      const created = await this.conversationRepository.create({
        workspace_id: workspaceId,
        user_id: context.user_id,
        kind: dto.kind,
        agent_slug: dto.agent_slug ?? null,
        title: dto.title ?? null,
        title_source: dto.title_source ?? (dto.title ? 'user' : null),
        origin_message_id: dto.origin_message_id ?? null,
        origin_channel: dto.origin_channel ?? 'web',
      });

      // Audit event: ids and counts only, never message content.
      await this.auditLogger.log({
        action: 'conversation.created',
        context,
        target_resource_id: created.id,
        target_resource_type: 'conversation',
        metadata: {
          kind: created.kind,
          agent_slug: created.agent_slug,
        },
      });

      return created;
    });

    return conversation;
  }
}
