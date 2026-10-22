import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { RunRelayLog } from '@/server/domain/chat/run_relay_log';
import { isTerminalRunStatus } from '@/server/domain/entities/chat_run';
import { DomainError } from '@/server/domain/errors/domain_error';
import type { ChatRunRepository } from '@/server/domain/repositories/chat_run_repository';
import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';
import type { MessageRepository } from '@/server/domain/repositories/message_repository';
import { noTransaction, type TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import { resolveOwnedConversation } from '@/server/application/chat/resolve_owned_conversation';

export interface DeleteConversationDeps {
  conversations: ConversationRepository;
  messages: MessageRepository;
  chatRuns: ChatRunRepository;
  /** The existing run cancel path (CancelRunUseCase). */
  cancelRun: { execute(runHandle: string, context: RequestContext): Promise<unknown> };
  audit: AuditLogger;
  log: RunRelayLog;
  transactions?: TransactionRunner;
}

export class DeleteConversationUseCase {
  constructor(private readonly deps: DeleteConversationDeps) {}

  async execute(conversationId: string, context: RequestContext): Promise<void> {
    const { conversations, messages, chatRuns, audit, log } = this.deps;
    const transactions = this.deps.transactions ?? noTransaction;

    const conversation = await resolveOwnedConversation(conversations, conversationId, context);

    // Stop live replies first, outside the transaction: the cancel talks to
    // sineva-ai and must not hold a database transaction open. A drain that
    // still finishes afterwards finds no run row to finalize and its message
    // insert fails on the foreign key, so nothing is written into the
    // deleted chat (the relay logs that as store_reply_failed).
    const active = (await chatRuns.listByConversation(conversation.id)).filter(
      (run) => !isTerminalRunStatus(run.status),
    );
    for (const run of active) {
      try {
        await this.deps.cancelRun.execute(run.run_handle, context);
      } catch (error) {
        // A refused or unreachable cancel (409, 502, 503) must not make the
        // person's deletion impossible; anything else is a real bug and
        // propagates with the conversation intact.
        if (!(error instanceof DomainError)) throw error;
        log.failed('cancel_before_delete_failed', { run_handle: run.run_handle, cause: error });
      }
    }

    await transactions.run(async () => {
      // Counted inside the transaction so the audit row describes what the
      // delete below removes. The audit write comes before the delete so a
      // failed audit leaves the data in place (no deletion without its row).
      const [messageCount, runs] = await Promise.all([
        messages.countByConversation(conversation.id),
        chatRuns.listByConversation(conversation.id),
      ]);
      await audit.log({
        action: 'conversation.deleted',
        context,
        target_resource_id: conversation.id,
        target_resource_type: 'conversation',
        metadata: {
          kind: conversation.kind,
          agent_slug: conversation.agent_slug,
          message_count: messageCount,
          run_count: runs.length,
        },
      });
      // Messages and chat_runs go with it through ON DELETE CASCADE.
      await conversations.delete(conversation.id);
    });
  }
}
