import type { CreateWorkflowDto } from '@/server/application/dtos/workflow_dto';
import { createDraft, type WorkflowDeps } from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { WorkflowEntity } from '@/server/domain/workflows/workflow';
import { emptyDefinition, type WorkflowDefinition } from '@/shared/workflows/definition';

export class CreateWorkflowUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  async execute(dto: CreateWorkflowDto, context: RequestContext): Promise<WorkflowEntity> {
    return createDraft(this.deps, context, {
      name: dto.name,
      description: dto.description ?? null,
      // The body is only size-checked here; the validator judges it at publish and run.
      definition: (dto.definition as unknown as WorkflowDefinition | undefined) ?? emptyDefinition(),
      template_slug: null,
    });
  }
}
