import type { UpdateWorkflowDto } from '@/server/application/dtos/workflow_dto';
import {
  assertCanEdit,
  loadWorkflow,
  requireWorkspace,
  type WorkflowDeps,
} from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { WorkflowEntity } from '@/server/domain/workflows/workflow';
import { DraftConflictError, WorkflowStateError } from '@/server/domain/workflows/workflow_errors';
import type { WorkflowDefinition } from '@/shared/workflows/definition';

export class UpdateWorkflowDraftUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  /**
   * Saves a half finished draft on purpose: autosave must not lose work to a
   * rule the person has not reached yet. Publish and run judge the definition.
   * Only a definition change moves the revision (and so un-tests the draft).
   */
  async execute(id: string, dto: UpdateWorkflowDto, context: RequestContext): Promise<WorkflowEntity> {
    const workspaceId = requireWorkspace(context);
    const workflow = await loadWorkflow(this.deps, context, id);
    if (workflow.status === 'archived') {
      throw new WorkflowStateError('workflow_archived', 'An archived Workflow cannot be edited');
    }
    assertCanEdit(workflow, context);
    const updated = await this.deps.workflows.updateDraft(
      workspaceId,
      id,
      {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.definition !== undefined ? { definition: dto.definition as unknown as WorkflowDefinition } : {}),
      },
      dto.expected_revision,
    );
    if (updated) return updated;
    // Stale revision, or the row vanished between the two reads.
    const current = await this.deps.workflows.findById(workspaceId, id);
    if (!current) throw new NotFoundError('Workflow', id);
    throw new DraftConflictError(current.draft_revision);
  }
}
