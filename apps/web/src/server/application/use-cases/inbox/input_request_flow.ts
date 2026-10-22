import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ContextSigner } from '@/server/domain/context/signed_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import {
  AlreadyDecidedError,
  InvalidInboxPayloadError,
  NotDismissableError,
  VersionConflictError,
} from '@/server/domain/inbox/inbox_errors';
import type { InboxLog } from '@/server/domain/inbox/inbox_log';
import type { InputRequestEntity } from '@/server/domain/inbox/inbox_item';
import { validateAnswers } from '@/server/domain/inbox/input_answers';
import type { AiEngineGateway } from '@/server/domain/repositories/ai_engine_gateway';
import type { InboxRepository } from '@/server/domain/repositories/inbox_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { InboxItemView } from '@/shared/inbox_view';
import { requireActor, workspaceOf } from './inbox_access';
import { resumeUpstream } from './inbox_resume';
import { buildItemView } from './inbox_view_builder';

export interface InputRequestDeps {
  inbox: InboxRepository;
  audit: AuditLogger;
  transactions: TransactionRunner;
  gateway: AiEngineGateway;
  contextSigner: ContextSigner;
  log: InboxLog;
  now?: () => Date;
}

function alreadyOf(request: InputRequestEntity): AlreadyDecidedError {
  const decision = request.status === 'pending' ? null : request.status;
  return new AlreadyDecidedError(decision, null);
}

/**
 * Settles an input request: claim, resume, commit, the same order as an
 * approval decision (ADR-0032). `answered` carries the answers to the run;
 * `dismissed` tells it the question went unanswered. Answers are user content:
 * they reach the run and the row, never the audit log or the logs.
 */
export async function settleInputRequest(
  deps: InputRequestDeps,
  request: { item_id: string; mode: 'answered' | 'dismissed'; version?: number; answers?: Record<string, unknown> },
  context: RequestContext,
): Promise<InboxItemView> {
  const now = (deps.now ?? (() => new Date()))();
  const workspaceId = workspaceOf(context);
  const bundle = await deps.inbox.findBundle(workspaceId, request.item_id);
  requireActor(bundle?.item ?? null, context, 'Inbox item', request.item_id);
  const input = bundle?.input_request;
  if (!bundle || !input) {
    if (request.mode === 'dismissed' && bundle) throw new NotDismissableError();
    throw new NotFoundError('Inbox item', request.item_id);
  }

  if (input.status !== 'pending' || input.claimed_at) throw alreadyOf(input);
  const version = request.version ?? input.version;
  if (input.version !== version) throw new VersionConflictError();

  if (request.mode === 'answered') {
    const check = validateAnswers(input.fields, request.answers ?? {});
    if (!check.ok) throw new InvalidInboxPayloadError('invalid_answer', check.field);
  }

  const won = await deps.inbox.claimInputRequest(input.id, { expected_version: version, user_id: context.user_id }, now);
  if (!won) {
    const current = await deps.inbox.findInputRequest(workspaceId, input.id);
    throw current && (current.status !== 'pending' || current.claimed_at) ? alreadyOf(current) : new VersionConflictError();
  }

  const release = async () => {
    try {
      await deps.inbox.releaseInputRequest(input.id, context.user_id);
    } catch (cause) {
      deps.log.failed('release_claim_failed', { workspace_id: workspaceId, cause });
    }
  };

  try {
    await resumeUpstream(deps, {
      upstream_run_id: input.run_id,
      recipient_user_id: bundle.item.recipient_user_id,
      context,
      agent_slug: input.agent_slug,
      run_handle: input.source_id,
      body: {
        kind: 'input_request',
        input_request_id: input.upstream_request_id,
        decision: request.mode,
        decided_at: now.toISOString(),
        ...(request.mode === 'answered' ? { answers: request.answers ?? {} } : {}),
      },
      idempotency_key: `${input.id}:${request.mode}`,
    });
  } catch (error) {
    await release();
    throw error;
  }

  try {
    await deps.transactions.run(async () => {
      const committed = await deps.inbox.commitInputRequest(input.id, {
        expected_version: version,
        user_id: context.user_id,
        status: request.mode,
        answer: request.mode === 'answered' ? (request.answers ?? {}) : null,
        now,
      });
      if (!committed) throw new VersionConflictError();
      if (request.mode === 'answered') {
        await deps.audit.log({
          action: 'input.answered',
          context,
          workspace_id: workspaceId,
          target_resource_type: 'input_request',
          target_resource_id: input.id,
          metadata: {
            inbox_item_id: bundle.item.id,
            agent_slug: input.agent_slug,
            answer_count: Object.keys(request.answers ?? {}).length,
          },
        });
      } else {
        await deps.audit.log({
          action: 'input.dismissed',
          context,
          workspace_id: workspaceId,
          target_resource_type: 'input_request',
          target_resource_id: input.id,
          metadata: { inbox_item_id: bundle.item.id, agent_slug: input.agent_slug },
        });
      }
    });
  } catch (error) {
    await release();
    throw error;
  }

  const fresh = await deps.inbox.findBundle(workspaceId, bundle.item.id);
  if (!fresh) throw new NotFoundError('Inbox item', request.item_id);
  return buildItemView(fresh, context, { unread: false, detail: { revisions: [] } });
}
