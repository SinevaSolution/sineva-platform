import type { UseWorkflowTemplateDto } from '@/server/application/dtos/workflow_dto';
import { createDraft, type WorkflowDeps } from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { WorkflowEntity } from '@/server/domain/workflows/workflow';
import { findWorkflowTemplate } from '@/shared/workflows/templates';

export class UseWorkflowTemplateUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  /**
   * An editable copy, always a draft. A missing specialist or app does not stop
   * the copy: the draft opens as "Needs attention" and says what to connect
   * (Design Spec 10, SCR-WF-02).
   */
  async execute(slug: string, dto: UseWorkflowTemplateDto, context: RequestContext): Promise<WorkflowEntity> {
    const template = findWorkflowTemplate(slug);
    if (!template) throw new NotFoundError('Workflow template', slug);
    return createDraft(this.deps, context, {
      name: dto.name ?? template.name[dto.locale],
      description: template.summary[dto.locale],
      definition: template.build(dto.locale),
      template_slug: template.slug,
    });
  }
}
