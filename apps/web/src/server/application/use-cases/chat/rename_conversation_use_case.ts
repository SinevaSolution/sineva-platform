import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';
import type { RenameConversationDto } from '@/server/application/dtos/conversation_dto';
import { resolveOwnedConversation } from '@/server/application/chat/resolve_owned_conversation';
import { noTransaction, type TransactionRunner } from '@/server/domain/transactions/transaction_runner';

export class RenameConversationUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly audit: AuditLogger,
    private readonly transactions: TransactionRunner = noTransaction,
  ) {}

  async execute(
    conversationId: string,
    dto: RenameConversationDto,
    context: RequestContext,
  ): Promise<ConversationEntity> {
    // Ownership first: another member's id is a plain 404 before any write.
    const existing = await resolveOwnedConversation(this.conversations, conversationId, context);

    return this.transactions.run(async () => {
      // The repository sets title_source = 'user', which is what keeps a later
      // automatic title from overwriting a name the person chose.
      const renamed = await this.conversations.rename(existing.id, dto.title);
      // The title is the person's own text, so only its length is recorded.
      await this.audit.log({
        action: 'conversation.renamed',
        context,
        target_resource_id: renamed.id,
        target_resource_type: 'conversation',
        metadata: { kind: renamed.kind, agent_slug: renamed.agent_slug, title_length: dto.title.length },
      });
      return renamed;
    });
  }
}
