import type {
  CreateApprovalRequest,
  CreateInputRequestRequest,
} from '@/server/application/inbox/approval_contract_dto';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ChatRunEntity } from '@/server/domain/entities/chat_run';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { InboxItemCreator } from '@/server/domain/inbox/inbox_item_creator';
import type { ChatRunRepository } from '@/server/domain/repositories/chat_run_repository';
import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';

export interface IngestRunInboxEventDeps {
  chatRuns: ChatRunRepository;
  conversations: ConversationRepository;
  creator: InboxItemCreator;
}

export interface IngestResult {
  inbox_item_id: string;
  approval_id?: string;
  input_request_id?: string;
  created: boolean;
}

/**
 * `POST /internal/v1/approvals` and `/input-requests` (sineva-ai to platform).
 * Used for runs with no attached browser stream (workflows, routines later);
 * the chat relay creates the same items itself, and both paths are idempotent.
 * sineva-ai names the workspace and the platform run handle; the recipient and
 * the sineva-ai run id come from the platform's own `chat_runs` and
 * `conversations` rows. A handle of another workspace is the same 404 as one
 * that does not exist.
 */
export class IngestRunInboxEventUseCase {
  constructor(private readonly deps: IngestRunInboxEventDeps) {}

  async createApproval(body: CreateApprovalRequest, requestId: string): Promise<IngestResult> {
    const { run, recipient } = await this.resolve(body.workspace_id, body.run_id);
    const created = await this.deps.creator.create(
      {
        kind: 'approval',
        workspace_id: body.workspace_id,
        recipient_user_id: recipient,
        agent_slug: body.agent_slug ?? run.agent_slug,
        title: body.draft_summary,
        source: { type: 'chat', id: run.run_handle },
        approval: {
          upstream_approval_id: body.approval_id,
          upstream_run_id: run.upstream_run_id,
          revision: body.revision,
          action_type: body.action_kind,
          payload: body.payload,
          guardrail_reason: body.guardrail_reason,
          expires_at: body.expires_at ? new Date(body.expires_at) : null,
        },
      },
      this.systemContext(body.workspace_id, requestId),
    );
    return {
      inbox_item_id: created.item.id,
      approval_id: created.approval?.id,
      created: created.created,
    };
  }

  async createInputRequest(body: CreateInputRequestRequest, requestId: string): Promise<IngestResult> {
    const { run, recipient } = await this.resolve(body.workspace_id, body.run_id);
    const created = await this.deps.creator.create(
      {
        kind: 'input_request',
        workspace_id: body.workspace_id,
        recipient_user_id: recipient,
        agent_slug: body.agent_slug ?? run.agent_slug,
        title: body.question,
        source: { type: 'chat', id: run.run_handle },
        input: {
          upstream_request_id: body.input_request_id,
          upstream_run_id: run.upstream_run_id,
          question: body.question,
          fields: body.fields,
          expires_at: body.expires_at ? new Date(body.expires_at) : null,
        },
      },
      this.systemContext(body.workspace_id, requestId),
    );
    return {
      inbox_item_id: created.item.id,
      input_request_id: created.input_request?.id,
      created: created.created,
    };
  }

  private async resolve(workspaceId: string, runHandle: string): Promise<{ run: ChatRunEntity; recipient: string }> {
    const run = await this.deps.chatRuns.findByHandle(runHandle);
    if (!run || run.workspace_id !== workspaceId) throw new NotFoundError('Run', runHandle);
    const conversation = await this.deps.conversations.findById(run.conversation_id);
    if (!conversation || conversation.workspace_id !== workspaceId) throw new NotFoundError('Run', runHandle);
    return { run, recipient: conversation.user_id };
  }

  private systemContext(workspaceId: string, requestId: string): RequestContext {
    return {
      user_id: 'system:internal',
      workspace_id: workspaceId,
      session_id: 'internal',
      request_id: requestId,
      actor: { type: 'system', id: 'internal' },
    };
  }
}
