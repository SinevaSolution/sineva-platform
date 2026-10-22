import { loadWorkflow, requireWorkspace, type WorkflowDeps } from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { WorkflowEntity } from '@/server/domain/workflows/workflow';

export class ArchiveWorkflowUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  /** Archiving keeps versions and runs; it only stops new runs and edits. Archiving twice changes nothing. */
  async execute(id: string, context: RequestContext): Promise<WorkflowEntity> {
    const workspaceId = requireWorkspace(context);
    const workflow = await loadWorkflow(this.deps, context, id);
    if (workflow.status === 'archived') return workflow;
    return this.deps.transactions.run(async () => {
      const archived = await this.deps.workflows.archive(workspaceId, id, this.deps.now());
      await this.deps.audit.log({
        action: 'workflow.archived',
        context,
        target_resource_type: 'workflow',
        target_resource_id: id,
        metadata: { had_version: workflow.current_version_id !== null },
      });
      return archived;
    });
  }
}
