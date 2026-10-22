import type { RestoreWorkflowDto } from '@/server/application/dtos/workflow_dto';
import {
  assertValid,
  loadFacts,
  loadWorkflow,
  requireWorkspace,
  stepCountOf,
  type WorkflowDeps,
} from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { WorkflowEntity, WorkflowVersionEntity } from '@/server/domain/workflows/workflow';
import { WorkflowStateError } from '@/server/domain/workflows/workflow_errors';

export class RestoreWorkflowVersionUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  /**
   * Republishes an old definition as a new number (nothing is rewritten) and
   * makes it the draft, so the editor and the live version agree. It skips the
   * test-run gate because that definition was tested when it was first
   * published; it still has to pass today's validation (a connection may be
   * gone since).
   */
  async execute(
    id: string,
    versionId: string,
    dto: RestoreWorkflowDto,
    context: RequestContext,
  ): Promise<{ workflow: WorkflowEntity; version: WorkflowVersionEntity }> {
    const workspaceId = requireWorkspace(context);
    const workflow = await loadWorkflow(this.deps, context, id);
    if (workflow.status === 'archived') {
      throw new WorkflowStateError('workflow_archived', 'An archived Workflow cannot be restored');
    }
    const old = await this.deps.versions.findById(workspaceId, id, versionId);
    if (!old) throw new NotFoundError('Workflow version', versionId);
    const facts = await loadFacts(this.deps, context, { strict: true });
    assertValid(old.definition, facts);

    return this.deps.transactions.run(async () => {
      await this.deps.workflows.replaceDraft(workspaceId, id, old.definition);
      const version = await this.deps.versions.create({
        workflow_id: id,
        workspace_id: workspaceId,
        definition: old.definition,
        note: dto.note ?? null,
        restored_from: old.version_number,
        published_by: context.user_id,
      });
      const published = await this.deps.workflows.markPublished(workspaceId, id, version.id);
      await this.deps.audit.log({
        action: 'workflow.version_restored',
        context,
        target_resource_type: 'workflow',
        target_resource_id: id,
        metadata: {
          version_number: version.version_number,
          restored_from: old.version_number,
          step_count: stepCountOf(old.definition),
        },
      });
      return { workflow: published, version };
    });
  }
}
