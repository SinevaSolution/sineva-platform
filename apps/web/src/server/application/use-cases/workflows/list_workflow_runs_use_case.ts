import type { ListWorkflowRunsQuery } from '@/server/application/dtos/workflow_dto';
import { requireWorkspace, type WorkflowDeps } from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { WorkflowRunEntity } from '@/server/domain/workflows/workflow';

export class ListWorkflowRunsUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  async execute(
    query: ListWorkflowRunsQuery,
    context: RequestContext,
  ): Promise<{
    items: Array<{ run: WorkflowRunEntity; workflow_name: string }>;
    total: number;
    page: number;
    per_page: number;
  }> {
    const workspaceId = requireWorkspace(context);
    const { items, total } = await this.deps.runs.list(workspaceId, {
      workflow_id: query.workflow_id,
      status: query.status,
      mode: query.mode,
      limit: query.per_page,
      offset: (query.page - 1) * query.per_page,
    });
    const names = await this.deps.workflows.namesByIds(workspaceId, [...new Set(items.map((run) => run.workflow_id))]);
    return {
      items: items.map((run) => ({ run, workflow_name: names.get(run.workflow_id) ?? '' })),
      total,
      page: query.page,
      per_page: query.per_page,
    };
  }
}
