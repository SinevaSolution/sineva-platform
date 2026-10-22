import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ContextSigner } from '@/server/domain/context/signed_context';
import {
  REMINDER_LEAD_MS,
  STALE_CLAIM_MS,
  type ApprovalEntity,
  type InputRequestEntity,
} from '@/server/domain/inbox/inbox_item';
import type { InboxLog } from '@/server/domain/inbox/inbox_log';
import type { AiEngineGateway } from '@/server/domain/repositories/ai_engine_gateway';
import type { InboxRepository } from '@/server/domain/repositories/inbox_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import { resumeUpstream } from './inbox_resume';

export interface ExpireInboxDeps {
  inbox: InboxRepository;
  audit: AuditLogger;
  transactions: TransactionRunner;
  gateway: AiEngineGateway;
  contextSigner: ContextSigner;
  log: InboxLog;
  now?: () => Date;
}

export interface ReminderDue {
  approval_id: string;
  inbox_item_id: string;
  workspace_id: string;
}

export interface ExpireInboxResult {
  expired_approvals: number;
  expired_inputs: number;
  resumed: number;
  resume_failed: number;
  stale_claims_released: number;
  /** Approvals that expire within 24 hours; the notification work reads this. Not marked as sent here. */
  reminders_due: ReminderDue[];
}

const BATCH = 100;

/**
 * The expiry job (FR-INBOX-12), run from the internal job route. It never
 * approves: a due item becomes `expired` and the run is told "not approved".
 * A resume that fails is kept (the row stays `expired` with no delivery
 * stamp) and retried by the next run, so a run cannot hang on an expired
 * item and a failure is never silent.
 */
export class ExpireInboxItemsUseCase {
  private readonly now: () => Date;

  constructor(private readonly deps: ExpireInboxDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async execute(at: Date = this.now()): Promise<ExpireInboxResult> {
    const result: ExpireInboxResult = {
      expired_approvals: 0,
      expired_inputs: 0,
      resumed: 0,
      resume_failed: 0,
      stale_claims_released: 0,
      reminders_due: [],
    };

    result.stale_claims_released = await this.deps.inbox.releaseStaleClaims(new Date(at.getTime() - STALE_CLAIM_MS));

    const due = await this.deps.inbox.listExpirable(at, BATCH);
    for (const approval of due.approvals) {
      if (await this.guard(approval.workspace_id, () => this.expireApproval(approval, at))) {
        result.expired_approvals += 1;
      }
    }
    for (const request of due.input_requests) {
      if (await this.guard(request.workspace_id, () => this.expireInput(request, at))) {
        result.expired_inputs += 1;
      }
    }

    const owed = await this.deps.inbox.listUndeliveredExpired(BATCH);
    for (const approval of owed.approvals) {
      await this.deliver(result, approval.workspace_id, () => this.resumeApproval(approval, at));
    }
    for (const request of owed.input_requests) {
      await this.deliver(result, request.workspace_id, () => this.resumeInput(request, at));
    }

    const reminders = await this.deps.inbox.listReminderDue(at, REMINDER_LEAD_MS, BATCH);
    result.reminders_due = reminders.map((a) => ({
      approval_id: a.id,
      inbox_item_id: a.inbox_item_id,
      workspace_id: a.workspace_id,
    }));
    return result;
  }

  private systemContext(workspaceId: string, userId: string | null): RequestContext {
    return {
      user_id: userId ?? 'system:inbox-expiry',
      workspace_id: workspaceId,
      session_id: 'internal',
      request_id: 'inbox-expiry-job',
      actor: { type: 'system', id: 'inbox-expiry' },
    };
  }

  /** One failing row must not stop the others. */
  private async guard(workspaceId: string, work: () => Promise<boolean>): Promise<boolean> {
    try {
      return await work();
    } catch (cause) {
      this.deps.log.failed('expiry_item_failed', { workspace_id: workspaceId, cause });
      return false;
    }
  }

  private async expireApproval(approval: ApprovalEntity, at: Date): Promise<boolean> {
    return this.deps.transactions.run(async () => {
      if (!(await this.deps.inbox.expireApproval(approval.id, at))) return false;
      await this.deps.audit.log({
        action: 'approval.expired',
        context: this.systemContext(approval.workspace_id, null),
        workspace_id: approval.workspace_id,
        actor: { type: 'system', id: 'inbox-expiry' },
        target_resource_type: 'approval',
        target_resource_id: approval.id,
        outcome: 'allowed',
        metadata: {
          inbox_item_id: approval.inbox_item_id,
          action_type: approval.action_type,
          agent_slug: approval.agent_slug,
        },
      });
      return true;
    });
  }

  private async expireInput(request: InputRequestEntity, at: Date): Promise<boolean> {
    return this.deps.transactions.run(async () => {
      if (!(await this.deps.inbox.expireInputRequest(request.id, at))) return false;
      await this.deps.audit.log({
        action: 'input.expired',
        context: this.systemContext(request.workspace_id, null),
        workspace_id: request.workspace_id,
        actor: { type: 'system', id: 'inbox-expiry' },
        target_resource_type: 'input_request',
        target_resource_id: request.id,
        metadata: { inbox_item_id: request.inbox_item_id, agent_slug: request.agent_slug },
      });
      return true;
    });
  }

  private async deliver(result: ExpireInboxResult, workspaceId: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
      result.resumed += 1;
    } catch (cause) {
      result.resume_failed += 1;
      this.deps.log.failed('expiry_resume_failed', { workspace_id: workspaceId, cause });
    }
  }

  private async recipientOf(workspaceId: string, itemId: string): Promise<string | null> {
    return (await this.deps.inbox.findBundle(workspaceId, itemId))?.item.recipient_user_id ?? null;
  }

  private async resumeApproval(approval: ApprovalEntity, at: Date): Promise<void> {
    const recipient = await this.recipientOf(approval.workspace_id, approval.inbox_item_id);
    await resumeUpstream(this.deps, {
      upstream_run_id: approval.run_id,
      recipient_user_id: recipient,
      context: this.systemContext(approval.workspace_id, recipient),
      agent_slug: approval.agent_slug,
      run_handle: approval.source_id,
      body: {
        kind: 'approval',
        approval_id: approval.upstream_approval_id,
        revision: approval.revision,
        decision: 'expired',
        decided_at: at.toISOString(),
        payload_hash: approval.payload_hash,
        edited: false,
        result: { executed: false },
      },
      idempotency_key: `${approval.id}:${approval.revision}:expired`,
    });
    await this.deps.inbox.markResumeDelivered('approval', approval.id, at);
  }

  private async resumeInput(request: InputRequestEntity, at: Date): Promise<void> {
    const recipient = await this.recipientOf(request.workspace_id, request.inbox_item_id);
    await resumeUpstream(this.deps, {
      upstream_run_id: request.run_id,
      recipient_user_id: recipient,
      context: this.systemContext(request.workspace_id, recipient),
      agent_slug: request.agent_slug,
      run_handle: request.source_id,
      body: {
        kind: 'input_request',
        input_request_id: request.upstream_request_id,
        decision: 'expired',
        decided_at: at.toISOString(),
      },
      idempotency_key: `${request.id}:expired`,
    });
    await this.deps.inbox.markResumeDelivered('input_request', request.id, at);
  }
}
