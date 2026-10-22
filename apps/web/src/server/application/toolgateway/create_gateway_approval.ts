import { GMAIL_APPROVAL_TYPES } from '@/server/domain/toolgateway/gmail_approval';
import type { GatewayApprovalCreator } from '@/server/domain/toolgateway/gateway_ports';
import { ToolGatewayError } from '@/server/domain/toolgateway/tool_executor';
import type { InboxItemCreator } from '@/server/domain/inbox/inbox_item_creator';
import type { ChatRunRepository } from '@/server/domain/repositories/chat_run_repository';

export class CreateGatewayApproval implements GatewayApprovalCreator {
  constructor(
    private readonly creator: InboxItemCreator,
    private readonly runs: ChatRunRepository,
  ) {}
  async create(input: Parameters<GatewayApprovalCreator['create']>[0]): Promise<string> {
    const actionType = GMAIL_APPROVAL_TYPES[input.action.action_id];
    if (!actionType) throw new ToolGatewayError('action_not_allowed');
    const run = await this.runs.findByHandle(input.claims.run_id);
    if (!run || run.workspace_id !== input.claims.tenant_id)
      throw new ToolGatewayError('action_not_allowed');
    const { idempotency_key: ignored, ...request } = input.request;
    void ignored;
    const template =
      input.claims.locale === 'id'
        ? input.action.approval_sentence_template.id
        : input.action.approval_sentence_template.en;
    const title = template.replace(/\{([a-z_]+)\}/g, (_, key: string) => {
      const value = input.request.arguments[key];
      return typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : '';
    });
    const created = await this.creator.create(
      {
        kind: 'approval',
        workspace_id: input.claims.tenant_id,
        recipient_user_id: input.claims.user_id,
        agent_slug: input.claims.agent_slug,
        title,
        source: { type: 'chat', id: input.claims.run_id },
        approval: {
          upstream_approval_id: input.gateway_call_id,
          upstream_run_id: run.upstream_run_id,
          revision: 1,
          action_type: actionType,
          payload: {
            gateway_call_id: input.gateway_call_id,
            connection_id: input.connection_id,
            external_account_id: input.external_account_id,
            account_label: input.account_label,
            request,
          },
          guardrail_reason:
            input.action.action_id === 'gmail_send_message' &&
            input.claims.trifecta.private_data &&
            input.claims.trifecta.untrusted_content &&
            input.claims.trifecta.send
              ? 'untrusted_send_requires_approval'
              : input.action.side_effect !== 'read'
                ? 'external_action_requires_approval'
                : 'connection_approval_policy',
        },
      },
      input.context,
    );
    if (!created.approval) throw new ToolGatewayError('dependency_unavailable', 503);
    // The runtime holds this correlation id; Inbox decisions use the separate platform row id.
    return input.gateway_call_id;
  }
}
