import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import { applyEditablePayload, getActionType, hashPayload } from '@/server/domain/approvals/action_types';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ContextSigner } from '@/server/domain/context/signed_context';
import type { ChatRunRepository } from '@/server/domain/repositories/chat_run_repository';
import { ToolGatewayError } from '@/server/domain/toolgateway/tool_executor';
import { RunResumeUnavailableError } from '@/server/domain/inbox/inbox_errors';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import {
  AlreadyDecidedError,
  AwaitingRevisionError,
  InvalidInboxPayloadError,
  VersionConflictError,
} from '@/server/domain/inbox/inbox_errors';
import type { InboxLog } from '@/server/domain/inbox/inbox_log';
import {
  isTerminalApproval,
  type ApprovalDecision,
  type ApprovalEntity,
} from '@/server/domain/inbox/inbox_item';
import type {
  AiEngineGateway,
  ResumeApprovalBody,
} from '@/server/domain/repositories/ai_engine_gateway';
import type { InboxRepository } from '@/server/domain/repositories/inbox_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { InboxItemView } from '@/shared/inbox_view';
import { requireActor, workspaceOf } from './inbox_access';
import { resumeUpstream } from './inbox_resume';
import { buildItemView } from './inbox_view_builder';

export interface ApprovalDecisionDeps {
  inbox: InboxRepository;
  audit: AuditLogger;
  transactions: TransactionRunner;
  gateway: AiEngineGateway;
  contextSigner: ContextSigner;
  log: InboxLog;
  now?: () => Date;
  actionExecutor?: { execute(approvalId: string, context: RequestContext): Promise<void> };
  chatRuns?: ChatRunRepository;
}

export interface DecisionRequest {
  approval_id: string;
  decision: ApprovalDecision;
  /** The version the caller last saw. */
  version: number;
  note?: string;
  instruction?: string;
  edited_payload?: Record<string, unknown>;
}

const AUDIT_ACTION = {
  approve: 'approval.approved',
  reject: 'approval.rejected',
  changes: 'approval.changes_requested',
} as const;

const RESUME_DECISION = {
  approve: 'approved',
  reject: 'rejected',
  changes: 'changes_requested',
} as const;

function decisionOfStatus(status: ApprovalEntity['status']): ApprovalDecision | 'expired' | null {
  if (status === 'approved') return 'approve';
  if (status === 'rejected') return 'reject';
  if (status === 'expired') return 'expired';
  return null;
}

/**
 * Claim, resume, commit (ADR-0032). The claim is the first-writer-wins step;
 * sineva-ai is told before anything is committed, so an unreachable upstream
 * leaves the item pending and retryable; the commit and its audit rows share
 * one transaction. Nothing here executes an action: `draft.review` approval
 * only marks the draft ready.
 */
export class ApprovalDecisionService {
  private readonly now: () => Date;

  constructor(private readonly deps: ApprovalDecisionDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async decide(request: DecisionRequest, context: RequestContext): Promise<InboxItemView> {
    const workspaceId = workspaceOf(context);
    const approval = await this.deps.inbox.findApproval(workspaceId, request.approval_id);
    const bundle = approval ? await this.deps.inbox.findBundle(workspaceId, approval.inbox_item_id) : null;
    requireActor(bundle?.item ?? null, context, 'Approval', request.approval_id);
    if (!approval || !bundle) throw new NotFoundError('Approval', request.approval_id);

    this.assertDecidable(approval, request.version);
    if (request.decision === 'changes' && getActionType(approval.action_type)?.executes) throw new InvalidInboxPayloadError('field_not_editable', 'instruction');

    let editedPayload: Record<string, unknown> | undefined;
    if (request.edited_payload) {
      if (request.decision !== 'approve') throw new InvalidInboxPayloadError('invalid_payload', 'edited_payload');
      const edit = applyEditablePayload(approval.action_type, approval.payload, request.edited_payload);
      if (!edit.ok) throw new InvalidInboxPayloadError(edit.code === 'unsupported_action_type' ? 'invalid_payload' : edit.code, edit.detail);
      editedPayload = edit.payload;
    }
    const editedHash = editedPayload ? hashPayload(editedPayload) : undefined;

    const now = this.now();
    const won = await this.deps.inbox.claimApproval(
      approval.id,
      { expected_version: request.version, user_id: context.user_id, decision: request.decision },
      now,
    );
    if (!won) throw await this.explainLostClaim(workspaceId, approval.id, request.version);

    const resumeDecision = RESUME_DECISION[request.decision];
    const body: ResumeApprovalBody = {
      kind: 'approval',
      approval_id: approval.upstream_approval_id,
      revision: editedPayload ? approval.revision + 1 : approval.revision,
      decision: resumeDecision,
      decided_at: now.toISOString(),
      payload_hash: editedHash ?? approval.payload_hash,
      edited: Boolean(editedPayload),
      ...(request.decision === 'changes' && request.instruction ? { instruction: request.instruction } : {}),
      ...(request.decision === 'reject' && request.note ? { note: request.note } : {}),
      result: { executed: false },
    };

    try {
      let upstreamRunId = approval.run_id;
      if (request.decision === 'approve' && getActionType(approval.action_type)?.executes) {
        if (!upstreamRunId && approval.source_id && this.deps.chatRuns) upstreamRunId = (await this.deps.chatRuns.findByHandle(approval.source_id))?.upstream_run_id ?? null;
        if (!upstreamRunId) throw new RunResumeUnavailableError();
        if (!this.deps.actionExecutor) throw new ToolGatewayError('provider_unavailable', 503);
        await this.deps.actionExecutor.execute(approval.id, context);
        body.result.executed = true;
      }
      await resumeUpstream(this.deps, {
        upstream_run_id: upstreamRunId,
        recipient_user_id: bundle.item.recipient_user_id,
        context,
        agent_slug: approval.agent_slug,
        run_handle: approval.source_id,
        body,
        idempotency_key: `${approval.id}:${approval.revision}:${resumeDecision}`,
      });
    } catch (error) {
      // Nothing was committed: free the claim so the person can retry.
      await this.release(approval.id, context);
      if (body.result.executed && error instanceof RunResumeUnavailableError) throw new ToolGatewayError('tool_resume_pending', 503, true);
      throw error;
    }

    try {
      await this.deps.transactions.run(async () => {
        const committed = await this.deps.inbox.commitApproval(approval.id, {
          expected_version: request.version,
          user_id: context.user_id,
          status: request.decision === 'approve' ? 'approved' : request.decision === 'reject' ? 'rejected' : 'pending',
          note: request.note ?? null,
          change_request: request.decision === 'changes' ? (request.instruction ?? null) : null,
          ...(editedPayload && editedHash ? { edited: { payload: editedPayload, payload_hash: editedHash } } : {}),
          now,
        });
        if (!committed) throw new VersionConflictError();

        const base = {
          context,
          workspace_id: workspaceId,
          target_resource_type: 'approval',
          target_resource_id: approval.id,
        };
        const metadata = {
          inbox_item_id: approval.inbox_item_id,
          action_type: approval.action_type,
          agent_slug: approval.agent_slug,
          revision: approval.revision,
        };
        if (editedPayload && editedHash) {
          await this.deps.audit.log({
            ...base,
            action: 'approval.edited',
            metadata: { ...metadata, edited_fields: Object.keys(request.edited_payload ?? {}) },
            change: { before: { payload_hash: approval.payload_hash }, after: { payload_hash: editedHash } },
          });
        }
        await this.deps.audit.log({ ...base, action: AUDIT_ACTION[request.decision], metadata });
      });
    } catch (error) {
      // The run was told but nothing committed: free the claim. A retry of the
      // same decision resumes idempotently, so it cannot resume twice.
      await this.release(approval.id, context);
      throw error;
    }

    const fresh = await this.deps.inbox.findBundle(workspaceId, approval.inbox_item_id);
    if (!fresh) throw new NotFoundError('Approval', request.approval_id);
    return buildItemView(fresh, context, {
      unread: false,
      detail: { revisions: await this.deps.inbox.listRevisions(approval.id) },
    });
  }

  private assertDecidable(approval: ApprovalEntity, version: number): void {
    if (isTerminalApproval(approval.status)) {
      throw new AlreadyDecidedError(decisionOfStatus(approval.status), approval.decided_by_name);
    }
    if (approval.claimed_at) throw new AlreadyDecidedError(approval.claimed_decision, null);
    if (approval.awaiting_revision) throw new AwaitingRevisionError();
    if (approval.version !== version) throw new VersionConflictError();
  }

  /** Why a claim failed, from the row as it is now: someone decided, a revision is awaited, or the version moved. */
  private async explainLostClaim(workspaceId: string, approvalId: string, version: number): Promise<Error> {
    const now = await this.deps.inbox.findApproval(workspaceId, approvalId);
    if (!now) return new NotFoundError('Approval', approvalId);
    try {
      this.assertDecidable(now, version);
    } catch (error) {
      return error as Error;
    }
    return new VersionConflictError();
  }

  private async release(approvalId: string, context: RequestContext): Promise<void> {
    try {
      await this.deps.inbox.releaseApproval(approvalId, context.user_id);
    } catch (cause) {
      // The original failure is what the caller must see; the stale-claim
      // sweep frees this one within two minutes.
      this.deps.log.failed('release_claim_failed', { workspace_id: context.workspace_id, cause });
    }
  }
}
