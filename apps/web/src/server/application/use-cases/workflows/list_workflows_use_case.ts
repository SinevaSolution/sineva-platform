import type { ListWorkflowsQuery } from '@/server/application/dtos/workflow_dto';
import { issuesOf, loadFacts, requireWorkspace, type WorkflowDeps } from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { WorkflowEntity, WorkflowLastRun } from '@/server/domain/workflows/workflow';
import type { WorkflowIssue } from '@/shared/workflows/validate';

export interface WorkflowListEntry {
  workflow: WorkflowEntity;
  last_run: WorkflowLastRun | null;
  /** Issues that make it "Needs attention"; null when sineva-ai could not be asked, so it is unknown. */
  attention: WorkflowIssue[] | null;
}

/** Enough for a workspace's whole list when the filter has to look at every row. */
const SCAN_LIMIT = 500;

export class ListWorkflowsUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  async execute(
    query: ListWorkflowsQuery,
    context: RequestContext,
  ): Promise<{ items: WorkflowListEntry[]; total: number; page: number; per_page: number }> {
    const workspaceId = requireWorkspace(context);
    const facts = await loadFacts(this.deps, context, { strict: false });
    const attentionOf = (workflow: WorkflowEntity): WorkflowIssue[] | null =>
      facts.catalog_known ? issuesOf(workflow.draft_definition, facts).filter((issue) => issue.needs_attention) : null;
    const offset = (query.page - 1) * query.per_page;

    // "Needs attention" is computed from live facts, not stored, so the filter
    // has to look at every row before it can page.
    if (query.status === 'needs_attention') {
      const { items } = await this.deps.workflows.list(workspaceId, { q: query.q, limit: SCAN_LIMIT, offset: 0 });
      const flagged = items
        .map((item) => ({ ...item, attention: attentionOf(item.workflow) }))
        .filter((item) => item.attention !== null && item.attention.length > 0);
      return {
        items: flagged.slice(offset, offset + query.per_page),
        total: flagged.length,
        page: query.page,
        per_page: query.per_page,
      };
    }

    const { items, total } = await this.deps.workflows.list(workspaceId, {
      q: query.q,
      status: query.status,
      limit: query.per_page,
      offset,
    });
    return {
      items: items.map((item) => ({ ...item, attention: attentionOf(item.workflow) })),
      total,
      page: query.page,
      per_page: query.per_page,
    };
  }
}
