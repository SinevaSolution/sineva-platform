import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import {
  computeApprovalExpiry,
  getActionType,
  hashPayload,
  validatePayload,
} from '@/server/domain/approvals/action_types';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ConflictError } from '@/server/domain/errors/domain_error';
import { InvalidInboxPayloadError } from '@/server/domain/inbox/inbox_errors';
import { MAX_INPUT_FIELDS } from '@/server/domain/inbox/inbox_item';
import type {
  CreatedInboxItem,
  InboxItemCreator,
  NewApprovalItem,
  NewInboxItem,
  NewInputRequestItem,
  NewResultItem,
} from '@/server/domain/inbox/inbox_item_creator';
import type { InboxBundle, InboxRepository } from '@/server/domain/repositories/inbox_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';

export interface CreateInboxItemDeps {
  inbox: InboxRepository;
  audit: AuditLogger;
  transactions: TransactionRunner;
  now?: () => Date;
}

const MAX_TITLE = 200;

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function created(bundle: InboxBundle, wasCreated: boolean): CreatedInboxItem {
  return { item: bundle.item, approval: bundle.approval, input_request: bundle.input_request, created: wasCreated };
}

/**
 * The one place an item is born (ADR-0032). Chat approvals, input requests,
 * results and later mentions and escalations all arrive here, are checked
 * against the action registry, and are stored with their audit event in one
 * transaction. Replays are no-ops.
 */
export class CreateInboxItemUseCase implements InboxItemCreator {
  private readonly now: () => Date;

  constructor(private readonly deps: CreateInboxItemDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async create(input: NewInboxItem, context: RequestContext): Promise<CreatedInboxItem> {
    return this.execute(input, context);
  }

  async execute(input: NewInboxItem, context: RequestContext): Promise<CreatedInboxItem> {
    switch (input.kind) {
      case 'approval':
        return this.createApproval(input, context);
      case 'input_request':
        return this.createInputRequest(input, context);
      case 'result':
        return this.createResult(input);
    }
  }

  private async createApproval(input: NewApprovalItem, context: RequestContext): Promise<CreatedInboxItem> {
    const { approval } = input;
    const gatewayReference = await this.deps.inbox.findApprovalByUpstreamId(input.workspace_id, approval.upstream_approval_id);
    if (gatewayReference && getActionType(gatewayReference.action_type)?.executes) {
      const bundle = await this.deps.inbox.findBundle(input.workspace_id, gatewayReference.inbox_item_id);
      if (!bundle || gatewayReference.agent_slug !== input.agent_slug || gatewayReference.source_id !== input.source.id || gatewayReference.source_type !== input.source.type || bundle.item.recipient_user_id !== input.recipient_user_id) throw new ConflictError('Approval', approval.upstream_approval_id);
      // A runtime event references a platform-created action; its text cannot replace the sealed payload.
      return created(bundle, false);
    }
    const definition = getActionType(approval.action_type);
    if (!definition) throw new InvalidInboxPayloadError('unsupported_action_type', 'action_kind');
    const check = validatePayload(approval.action_type, approval.payload);
    if (!check.ok) throw new InvalidInboxPayloadError('invalid_payload', 'payload');

    const existing = await this.deps.inbox.findApprovalByUpstreamId(input.workspace_id, approval.upstream_approval_id);
    if (existing) return this.replayApproval(existing.id, input, existing);

    const now = this.now();
    const sentence = definition.sentence({ agent_slug: input.agent_slug, payload: approval.payload });
    const expiresAt = computeApprovalExpiry(definition, approval.payload, now, approval.expires_at);

    return this.deps.transactions.run(async () => {
      const result = await this.deps.inbox.createApprovalItem({
        workspace_id: input.workspace_id,
        recipient_user_id: input.recipient_user_id,
        agent_slug: input.agent_slug,
        title: clip(input.title, MAX_TITLE),
        summary_key: sentence.key,
        summary_params: sentence.params,
        source_type: input.source.type,
        source_id: input.source.id,
        dedupe_key: `approval:${approval.upstream_approval_id}`,
        expires_at: expiresAt,
        upstream_approval_id: approval.upstream_approval_id,
        upstream_run_id: approval.upstream_run_id,
        action_type: approval.action_type,
        payload: approval.payload,
        payload_hash: hashPayload(approval.payload),
        risk_level: definition.risk_level,
        requirement: approval.guardrail_reason ? 'guardrail' : 'policy',
        guardrail_reason: approval.guardrail_reason,
      });
      if (result.created) {
        await this.deps.audit.log({
          action: 'approval.requested',
          context,
          workspace_id: input.workspace_id,
          target_resource_type: 'approval',
          target_resource_id: result.bundle.approval?.id,
          metadata: {
            inbox_item_id: result.bundle.item.id,
            action_type: approval.action_type,
            agent_slug: input.agent_slug,
            revision: 1,
          },
        });
      }
      return created(result.bundle, result.created);
    });
  }

  /**
   * An approval that already exists: the same revision is a replay, the next
   * revision answers a change request, anything else is a conflict. An older
   * revision is a late replay and is ignored.
   */
  private async replayApproval(
    approvalId: string,
    input: NewApprovalItem,
    existing: NonNullable<InboxBundle['approval']>,
  ): Promise<CreatedInboxItem> {
    const revision = input.approval.revision;
    if (revision <= existing.revision) return this.bundleOf(input.workspace_id, existing.inbox_item_id);
    if (revision !== existing.revision + 1 || !existing.awaiting_revision) {
      throw new ConflictError('Approval', input.approval.upstream_approval_id);
    }

    const definition = getActionType(input.approval.action_type)!;
    const sentence = definition.sentence({ agent_slug: input.agent_slug, payload: input.approval.payload });
    // One transaction: the revision row, the approval row and the item row move together.
    const appended = await this.deps.transactions.run(() =>
      this.deps.inbox.appendRevision(approvalId, {
        expected_revision: existing.revision,
        payload: input.approval.payload,
        payload_hash: hashPayload(input.approval.payload),
        title: clip(input.title, MAX_TITLE),
        guardrail_reason: input.approval.guardrail_reason,
        expires_at: computeApprovalExpiry(definition, input.approval.payload, this.now(), input.approval.expires_at),
        summary_params: sentence.params,
      }),
    );
    if (!appended) throw new ConflictError('Approval', input.approval.upstream_approval_id);
    return this.bundleOf(input.workspace_id, existing.inbox_item_id, false);
  }

  private async bundleOf(workspaceId: string, itemId: string, wasCreated = false): Promise<CreatedInboxItem> {
    const bundle = await this.deps.inbox.findBundle(workspaceId, itemId);
    if (!bundle) throw new ConflictError('InboxItem', itemId);
    return created(bundle, wasCreated);
  }

  private async createInputRequest(input: NewInputRequestItem, context: RequestContext): Promise<CreatedInboxItem> {
    if (input.input.fields.length > MAX_INPUT_FIELDS) throw new InvalidInboxPayloadError('invalid_payload', 'fields');
    return this.deps.transactions.run(async () => {
      const result = await this.deps.inbox.createInputItem({
        workspace_id: input.workspace_id,
        recipient_user_id: input.recipient_user_id,
        agent_slug: input.agent_slug,
        title: clip(input.title, MAX_TITLE),
        summary_key: 'inbox.sentence.input_request',
        summary_params: { specialist_slug: input.agent_slug },
        source_type: input.source.type,
        source_id: input.source.id,
        dedupe_key: `input:${input.input.upstream_request_id}`,
        due_at: input.input.expires_at ?? null,
        upstream_request_id: input.input.upstream_request_id,
        upstream_run_id: input.input.upstream_run_id,
        question: input.input.question,
        fields: input.input.fields,
      });
      if (result.created) {
        await this.deps.audit.log({
          action: 'input.requested',
          context,
          workspace_id: input.workspace_id,
          target_resource_type: 'input_request',
          target_resource_id: result.bundle.input_request?.id,
          metadata: {
            inbox_item_id: result.bundle.item.id,
            agent_slug: input.agent_slug,
            field_count: input.input.fields.length,
          },
        });
      }
      return created(result.bundle, result.created);
    });
  }

  private async createResult(input: NewResultItem): Promise<CreatedInboxItem> {
    const result = await this.deps.inbox.createResultItem({
      workspace_id: input.workspace_id,
      recipient_user_id: input.recipient_user_id,
      agent_slug: input.agent_slug,
      title: clip(input.title, MAX_TITLE),
      summary_key: input.summary_key,
      summary_params: input.summary_params,
      source_type: input.source.type,
      source_id: input.source.id,
      dedupe_key: input.dedupe_key,
    });
    return created(result.bundle, result.created);
  }
}
