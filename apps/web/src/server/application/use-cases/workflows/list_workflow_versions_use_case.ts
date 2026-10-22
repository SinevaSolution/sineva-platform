import { loadWorkflow, requireWorkspace, type WorkflowDeps } from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { WorkflowVersionEntity } from '@/server/domain/workflows/workflow';

export class ListWorkflowVersionsUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  async execute(id: string, context: RequestContext): Promise<WorkflowVersionEntity[]> {
    await loadWorkflow(this.deps, context, id);
    return this.deps.versions.list(requireWorkspace(context), id);
  }
}
