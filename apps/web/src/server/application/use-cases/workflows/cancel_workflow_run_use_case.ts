import {
  asEngineUnavailable,
  assertStarterOrManager,
  loadRun,
  runAudit,
  runCall,
} from '@/server/application/workflows/workflow_run_support';
import { requireWorkspace, type WorkflowDeps } from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { WorkflowRunEntity } from '@/server/domain/workflows/workflow';
import { WorkflowStateError } from '@/server/domain/workflows/workflow_errors';
import { isActiveRunStatus } from '@/shared/workflows/run_state';

export class CancelWorkflowRunUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  /**
   * The engine cancels first; the platform only records what it confirmed. If
   * the engine cannot be reached the run stays as it is and the person is told,
   * because a "cancelled" label on a run that keeps going would be a lie.
   */
  async execute(id: string, context: RequestContext): Promise<WorkflowRunEntity> {
    const { deps } = this;
    const run = await loadRun(deps, context, id);
    assertStarterOrManager(run, context);
    if (!isActiveRunStatus(run.status)) {
      throw new WorkflowStateError('run_not_active', 'This run is already over');
    }
    let answer;
    try {
      answer = await deps.gateway.cancelRun(run.engine_run_id, await runCall(deps, context, run));
    } catch (error) {
      throw asEngineUnavailable(error);
    }
    return deps.transactions.run(async () => {
      const updated = await deps.runs.update(requireWorkspace(context), id, {
        status: answer.status,
        finished_at: deps.now().toISOString(),
      });
      await deps.audit.log(runAudit('workflow.run.cancelled', run, context));
      return updated;
    });
  }
}
