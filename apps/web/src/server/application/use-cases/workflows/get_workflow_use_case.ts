import {
  issuesOf,
  loadFacts,
  loadWorkflow,
  requireWorkspace,
  type WorkflowDeps,
} from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { WorkflowEntity } from '@/server/domain/workflows/workflow';
import type { WorkflowIssue } from '@/shared/workflows/validate';

export class GetWorkflowUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  async execute(
    id: string,
    context: RequestContext,
  ): Promise<{
    workflow: WorkflowEntity;
    issues: WorkflowIssue[];
    attention: WorkflowIssue[] | null;
    tested_current_draft: boolean;
    catalog_known: boolean;
  }> {
    const workflow = await loadWorkflow(this.deps, context, id);
    const facts = await loadFacts(this.deps, context, { strict: false });
    const issues = issuesOf(workflow.draft_definition, facts);
    const tested = await this.deps.runs.hasSucceededTest(requireWorkspace(context), workflow.id, workflow.draft_revision);
    return {
      workflow,
      issues,
      attention: facts.catalog_known ? issues.filter((issue) => issue.needs_attention) : null,
      tested_current_draft: tested,
      catalog_known: facts.catalog_known,
    };
  }
}
