import type { WorkflowDeps } from '@/server/application/workflows/workflow_support';
import type { AuditEvent } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { RunBudget } from '@/server/domain/context/signed_context';
import { ForbiddenError, NotFoundError, UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import type { RunPatch, StepPatch, WorkflowRunEntity } from '@/server/domain/workflows/workflow';
import { WorkflowEngineUnavailableError } from '@/server/domain/workflows/workflow_errors';
import type { RunSnapshot, WorkflowRunCall } from '@/server/domain/workflows/workflow_ports';
import { isActiveRunStatus, type RunStatus } from '@/shared/workflows/run_state';
import { isManager, requireWorkspace } from './workflow_support';

/**
 * No ceiling is set by the platform yet: there is no plan or workspace cap, and
 * `open` mode never blocks (FR-BILL-34). Every member is null, which the engine
 * reads as "use your own limit".
 */
export function emptyBudget(): RunBudget {
  return {
    max_credits: null,
    max_tokens: null,
    max_tool_calls: null,
    max_wall_ms: null,
    max_media_jobs: null,
    max_media_cost: null,
  };
}

export async function loadRun(deps: Pick<WorkflowDeps, 'runs'>, context: RequestContext, id: string): Promise<WorkflowRunEntity> {
  const run = await deps.runs.findById(requireWorkspace(context), id);
  if (!run) throw new NotFoundError('Workflow run', id);
  return run;
}

/** The starter and Owner or Admin may act on a run (cancel, resume). */
export function assertStarterOrManager(run: WorkflowRunEntity, context: RequestContext): void {
  if (run.started_by === context.user_id || isManager(context)) return;
  throw new ForbiddenError('Only the person who started this run, or an admin, can do that');
}

/**
 * A run acts as its starter (D-M3 ground rules), so every call about it is
 * signed for the starter, whoever is looking at it. The `run_id` claim is the
 * correlation id sineva-ai knows.
 */
export async function runCall(
  deps: Pick<WorkflowDeps, 'contextSigner'>,
  context: RequestContext,
  run: WorkflowRunEntity,
): Promise<WorkflowRunCall> {
  const { token } = await deps.contextSigner.mint({ ...context, user_id: run.started_by }, { run_id: run.engine_run_id });
  return { context_token: token, request_id: context.request_id };
}

/** A call that did not reach the engine is "cannot run yet", not a generic 503. */
export function asEngineUnavailable(error: unknown): unknown {
  return error instanceof UpstreamUnavailableError && !(error instanceof WorkflowEngineUnavailableError)
    ? new WorkflowEngineUnavailableError()
    : error;
}

/** sineva-ai holds the internal key but no user session: the audit row says who spoke. */
export function engineContext(requestId: string, workspaceId: string): RequestContext {
  return {
    user_id: 'system:sineva-ai',
    workspace_id: workspaceId,
    session_id: 'internal',
    request_id: requestId,
    actor: { type: 'system', id: 'sineva-ai' },
  };
}

export function runAudit(
  action: string,
  run: WorkflowRunEntity,
  context: RequestContext,
  extra: Partial<Pick<AuditEvent, 'metadata' | 'reason_code' | 'actor'>> = {},
): AuditEvent {
  return {
    action,
    context,
    workspace_id: run.workspace_id,
    target_resource_type: 'workflow_run',
    target_resource_id: run.id,
    run_id: run.engine_run_id,
    ...extra,
    metadata: { workflow_id: run.workflow_id, mode: run.mode, ...extra.metadata },
  };
}

/** The PRD 10 audit event for a status change, if the change is one of them. */
function transitionAction(from: RunStatus, to: RunStatus): string | null {
  if (from === to) return null;
  if (to === 'succeeded') return 'workflow.run.completed';
  if (to === 'failed' || to === 'budget_exceeded') return 'workflow.run.failed';
  if (to === 'cancelled') return 'workflow.run.cancelled';
  return null;
}

export interface RunUpdate {
  patch: RunPatch;
  steps: StepPatch[];
  /** A step went into "needs review" for the first time with this update. */
  review_requested: boolean;
}

/**
 * Writes one update from sineva-ai (an event or a snapshot) and the audit rows
 * it implies, in the transaction the caller already opened. The status
 * transition decides the audit event, so an event and a poll that report the
 * same change cannot write it twice: the second sees the status already moved.
 */
export async function writeRunUpdate(
  deps: WorkflowDeps,
  run: WorkflowRunEntity,
  update: RunUpdate,
  context: RequestContext,
): Promise<void> {
  const workspaceId = run.workspace_id;
  if (Object.keys(update.patch).length > 0) {
    await deps.runs.update(workspaceId, run.id, update.patch);
  }
  for (const step of update.steps) {
    await deps.runs.upsertStep(workspaceId, run.id, step);
  }
  if (update.review_requested) {
    await deps.audit.log(runAudit('workflow.run.review_requested', run, context));
  }
  const next = update.patch.status;
  const action = next ? transitionAction(run.status, next) : null;
  if (next && action) {
    await deps.audit.log(
      runAudit(action, run, context, {
        reason_code: update.patch.error_code ?? undefined,
        metadata: { status: next, credits_used: update.patch.credits_used ?? run.credits_used },
      }),
    );
  }
}

/** True when a run can still change, so it is worth asking the engine about. */
export function isWorthReconciling(run: WorkflowRunEntity): boolean {
  return isActiveRunStatus(run.status);
}

/** What a snapshot says, as an update. Steps keep their order from the engine. */
export function snapshotToUpdate(run: WorkflowRunEntity, snapshot: RunSnapshot): RunUpdate {
  return {
    patch: {
      status: snapshot.status,
      credits_used: snapshot.credits_used,
      error_code: snapshot.error_code,
      started_at: snapshot.started_at ?? run.started_at,
      finished_at: snapshot.finished_at,
    },
    steps: snapshot.steps.map((step) => ({
      step_key: step.step_key,
      position: step.position,
      step_type: step.step_type,
      status: step.status,
      attempt: step.attempt,
      progress: step.progress,
      output_preview: step.output_preview,
      error_code: step.error_code,
      credits: step.credits,
      approval_id: step.approval_id,
      started_at: step.started_at,
      finished_at: step.finished_at,
    })),
    review_requested: false,
  };
}
