import { loadWorkflow, requireWorkspace, type WorkflowDeps } from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { WorkflowStateError } from '@/server/domain/workflows/workflow_errors';

export class DeleteWorkflowUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  /**
   * A Workflow with runs keeps its history: those runs pin versions and show
   * receipts, so it is archived instead (FR-WF-25). The database foreign keys
   * refuse the delete too, as the backstop for a run started in between.
   */
  async execute(id: string, context: RequestContext): Promise<{ id: string; deleted: true }> {
    const workspaceId = requireWorkspace(context);
    await loadWorkflow(this.deps, context, id);
    if (await this.deps.runs.hasRuns(workspaceId, id)) {
      throw new WorkflowStateError('workflow_has_runs', 'A Workflow with runs can only be archived');
    }
    await this.deps.transactions.run(async () => {
      await this.deps.workflows.delete(workspaceId, id);
      await this.deps.audit.log({
        action: 'workflow.deleted',
        context,
        target_resource_type: 'workflow',
        target_resource_id: id,
      });
    });
    return { id, deleted: true };
  }
}
