import type { ResumeWorkflowRunDto } from '@/server/application/dtos/workflow_dto';
import {
  asEngineUnavailable,
  assertStarterOrManager,
  loadRun,
  runAudit,
  runCall,
} from '@/server/application/workflows/workflow_run_support';
import { requireWorkspace, type WorkflowDeps } from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ForbiddenError } from '@/server/domain/errors/domain_error';
import type { WorkflowRunEntity } from '@/server/domain/workflows/workflow';
import { WorkflowStateError } from '@/server/domain/workflows/workflow_errors';

export class ResumeWorkflowRunUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  /**
   * "Resume from this step" for a failed run (FR-WF-26) and the Owner's
   * "Resume" after "Paused: budget reached" (FR-WF-21). Each fits one state; the
   * engine decides what already-done steps mean, so nothing is replayed here.
   * The idempotency key changes whenever the run moves, so a second failure
   * can be resumed again while a retried request cannot resume twice.
   */
  async execute(id: string, dto: ResumeWorkflowRunDto, context: RequestContext): Promise<WorkflowRunEntity> {
    const { deps } = this;
    const run = await loadRun(deps, context, id);
    const fits =
      (dto.mode === 'from_failed_step' && run.status === 'failed') ||
      (dto.mode === 'continue_after_budget' && run.status === 'budget_exceeded');
    if (!fits) {
      throw new WorkflowStateError('run_not_resumable', 'This run cannot be resumed that way');
    }
    if (dto.mode === 'continue_after_budget') {
      if (context.role !== 'owner') throw new ForbiddenError('Only the Owner can continue a run after its budget is reached');
    } else {
      assertStarterOrManager(run, context);
    }

    let answer;
    try {
      answer = await deps.gateway.resumeRun(
        run.engine_run_id,
        { mode: dto.mode },
        `${run.engine_run_id}:${run.last_event_seq}:${dto.mode}`,
        await runCall(deps, context, run),
      );
    } catch (error) {
      throw asEngineUnavailable(error);
    }
    return deps.transactions.run(async () => {
      const updated = await deps.runs.update(requireWorkspace(context), id, {
        status: answer.status,
        error_code: null,
        finished_at: null,
      });
      await deps.audit.log(runAudit('workflow.run.resumed', run, context, { metadata: { resume_mode: dto.mode } }));
      return updated;
    });
  }
}
