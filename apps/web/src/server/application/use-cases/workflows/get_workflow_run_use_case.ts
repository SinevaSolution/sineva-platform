import {
  engineContext,
  isWorthReconciling,
  loadRun,
  runCall,
  snapshotToUpdate,
  writeRunUpdate,
} from '@/server/application/workflows/workflow_run_support';
import { requireWorkspace, type WorkflowDeps } from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { DomainError } from '@/server/domain/errors/domain_error';
import { hasPermission } from '@/server/domain/permissions/registry';
import type { WorkflowRunEntity, WorkflowRunStepEntity } from '@/server/domain/workflows/workflow';

export interface WorkflowRunDetail {
  run: WorkflowRunEntity;
  steps: WorkflowRunStepEntity[];
  /** False when sineva-ai could not confirm the state just now; what is returned is what it last said. */
  engine_reachable: boolean;
  workflow_name: string;
  can_view_trace: boolean;
}

export class GetWorkflowRunUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  /**
   * An active run is read back from sineva-ai first (it holds the truth, the
   * platform row is a summary), so the screen never shows "running" for a run
   * that already ended. The snapshot only applies when it is newer than what
   * events already stored. A finished run is never asked about.
   */
  async execute(id: string, context: RequestContext): Promise<WorkflowRunDetail> {
    const { deps } = this;
    const workspaceId = requireWorkspace(context);
    let run = await loadRun(deps, context, id);
    let reachable = true;

    if (isWorthReconciling(run)) {
      try {
        const snapshot = await deps.gateway.getRun(run.engine_run_id, await runCall(deps, context, run));
        if (snapshot.last_sequence > run.last_event_seq && (await deps.runs.advanceSequence(workspaceId, run.id, snapshot.last_sequence))) {
          const stored = await deps.runs.listSteps(workspaceId, run.id);
          const reviewing = new Set(stored.filter((step) => step.status === 'needs_review').map((step) => step.step_key));
          const update = snapshotToUpdate(run, snapshot);
          update.review_requested = snapshot.steps.some((step) => step.status === 'needs_review' && !reviewing.has(step.step_key));
          await deps.transactions.run(() => writeRunUpdate(deps, run, update, engineContext(context.request_id, workspaceId)));
          run = (await deps.runs.findById(workspaceId, id)) ?? run;
        }
      } catch (error) {
        // Only the engine being unusable is tolerated; a bug must still surface.
        if (!(error instanceof DomainError) || error.status < 502) throw error;
        deps.log.warn('workflow.run_reconcile_failed', {
          workspace_id: workspaceId,
          run_handle: run.engine_run_id,
          reason: error.status === 503 ? 'unavailable' : 'bad_answer',
          code: error.code,
        });
        reachable = false;
      }
    }

    const canViewTrace = hasPermission(context.role ?? 'member', 'workflow.trace.view').allowed;
    const steps = (await deps.runs.listSteps(workspaceId, id)).map((step) =>
      canViewTrace ? step : { ...step, output_preview: null, trace: null },
    );
    const names = await deps.workflows.namesByIds(workspaceId, [run.workflow_id]);
    return {
      run,
      steps,
      engine_reachable: reachable,
      workflow_name: names.get(run.workflow_id) ?? '',
      can_view_trace: canViewTrace,
    };
  }
}
