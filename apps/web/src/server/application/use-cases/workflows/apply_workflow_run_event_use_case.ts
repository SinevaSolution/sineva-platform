import type { WorkflowRunEvent } from '@/server/application/workflows/run_event_dto';
import { engineContext, writeRunUpdate, type RunUpdate } from '@/server/application/workflows/workflow_run_support';
import type { WorkflowDeps } from '@/server/application/workflows/workflow_support';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { WorkflowRunEntity } from '@/server/domain/workflows/workflow';
import { isTerminalRunStatus } from '@/shared/workflows/run_state';

export interface ApplyResult {
  applied: boolean;
  /** The same `event_id` was already stored: a retried callback. */
  duplicate: boolean;
}

function updateFor(event: WorkflowRunEvent, run: WorkflowRunEntity): RunUpdate {
  switch (event.type) {
    case 'run_status': {
      const { data } = event;
      const terminal = isTerminalRunStatus(data.status);
      return {
        patch: {
          status: data.status,
          ...(data.credits_used !== undefined ? { credits_used: data.credits_used } : {}),
          error_code: data.error_code ?? null,
          // The first start sticks; a later event does not move it.
          ...(run.started_at === null && data.started_at ? { started_at: data.started_at } : {}),
          finished_at: terminal ? (data.finished_at ?? event.occurred_at) : null,
        },
        steps: [],
        review_requested: false,
      };
    }
    case 'step_started': {
      const { data } = event;
      return {
        patch: {},
        steps: [
          {
            step_key: data.step_key,
            position: data.position,
            step_type: data.step_type,
            status: 'running',
            attempt: data.attempt,
            ...(data.progress !== undefined ? { progress: data.progress } : {}),
            started_at: event.occurred_at,
            finished_at: null,
            error_code: null,
          },
        ],
        review_requested: false,
      };
    }
    case 'step_completed': {
      const { data } = event;
      const finished = data.status === 'done' || data.status === 'failed' || data.status === 'skipped';
      return {
        patch: {},
        steps: [
          {
            step_key: data.step_key,
            position: data.position,
            step_type: data.step_type,
            status: data.status,
            attempt: data.attempt,
            credits: data.credits,
            output_preview: data.output_preview,
            error_code: data.error_code,
            approval_id: data.approval_id,
            ...(data.progress !== undefined ? { progress: data.progress } : {}),
            ...(finished ? { finished_at: event.occurred_at } : {}),
          },
        ],
        review_requested: data.status === 'needs_review',
      };
    }
  }
}

export class ApplyWorkflowRunEventUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  /**
   * An event from sineva-ai (the internal events endpoint, ADR-0046). It is
   * authenticated by the internal key only, so every id is a claim: the tenant
   * must own the run, and another tenant's run is "not found" so a forged id
   * probes nothing. The write is a compare and set on the sequence: a late or
   * repeated event cannot move a run backwards, and the audit rows commit with
   * the change they describe. An event that does not apply is still stored,
   * because what sineva-ai said is the evidence when a run looks wrong.
   */
  async execute(event: WorkflowRunEvent, requestId: string): Promise<ApplyResult> {
    const { deps } = this;
    const run = await deps.runs.findByEngineRunId(event.run_id);
    if (!run || run.workspace_id !== event.tenant_id) {
      throw new NotFoundError('Workflow run', event.run_id);
    }

    const record = (applied: boolean) =>
      deps.runs.recordEvent({
        workspace_id: run.workspace_id,
        run_id: run.id,
        event_id: event.event_id,
        sequence: event.sequence,
        type: event.type,
        applied,
      });

    return deps.transactions.run(async () => {
      const advanced = await deps.runs.advanceSequence(run.workspace_id, run.id, event.sequence);
      const stored = await record(advanced);
      if (!advanced) {
        if (stored.inserted) {
          deps.log.warn('workflow.run_event_ignored', { workspace_id: run.workspace_id, run_handle: run.engine_run_id, reason: 'stale_sequence' });
        }
        return { applied: false, duplicate: !stored.inserted };
      }
      await writeRunUpdate(deps, run, updateFor(event, run), engineContext(requestId, run.workspace_id));
      return { applied: true, duplicate: false };
    });
  }
}
