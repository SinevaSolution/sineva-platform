import type { PublishWorkflowDto } from '@/server/application/dtos/workflow_dto';
import {
  assertValid,
  loadFacts,
  loadWorkflow,
  requireWorkspace,
  stepCountOf,
  type WorkflowDeps,
} from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { WorkflowEntity, WorkflowVersionEntity } from '@/server/domain/workflows/workflow';
import { DraftConflictError, WorkflowStateError } from '@/server/domain/workflows/workflow_errors';

export class PublishWorkflowUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  /**
   * Publish writes an immutable numbered version (FR-WF-25). It needs a draft
   * with no issues and one test run that succeeded on this exact draft
   * revision (FR-WF-20), so an edit after the test asks for a new one.
   */
  async execute(
    id: string,
    dto: PublishWorkflowDto,
    context: RequestContext,
  ): Promise<{ workflow: WorkflowEntity; version: WorkflowVersionEntity }> {
    const workspaceId = requireWorkspace(context);
    const workflow = await loadWorkflow(this.deps, context, id);
    if (workflow.status === 'archived') {
      throw new WorkflowStateError('workflow_archived', 'An archived Workflow cannot be published');
    }
    if (dto.expected_revision !== undefined && dto.expected_revision !== workflow.draft_revision) {
      throw new DraftConflictError(workflow.draft_revision);
    }
    // Strict: a guess about which specialists are on is not enough to publish.
    const facts = await loadFacts(this.deps, context, { strict: true });
    assertValid(workflow.draft_definition, facts);
    if (!(await this.deps.runs.hasSucceededTest(workspaceId, id, workflow.draft_revision))) {
      throw new WorkflowStateError('test_run_required', 'Run a test on this version of the Workflow first');
    }

    return this.deps.transactions.run(async () => {
      const version = await this.deps.versions.create({
        workflow_id: id,
        workspace_id: workspaceId,
        definition: workflow.draft_definition,
        note: dto.note ?? null,
        restored_from: null,
        published_by: context.user_id,
      });
      const published = await this.deps.workflows.markPublished(workspaceId, id, version.id);
      await this.deps.audit.log({
        action: 'workflow.version_published',
        context,
        target_resource_type: 'workflow',
        target_resource_id: id,
        metadata: { version_number: version.version_number, step_count: stepCountOf(version.definition) },
      });
      return { workflow: published, version };
    });
  }
}
