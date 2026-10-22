import type { LocaleCode } from '@sineva/i18n';
import type { UseSquadTemplateDto } from '@/server/application/dtos/squad_dto';
import type { SquadDescription } from '@/server/application/squads/squad_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { findSquadTemplate, localizeSquadTemplate } from '@/shared/squads/templates';
import type { CreateSquadUseCase } from './create_squad_use_case';

export class UseSquadTemplateUseCase {
  constructor(private readonly create: Pick<CreateSquadUseCase, 'execute'>) {}

  /** The same checks as a hand-made squad: a template skips typing, not validation. */
  async execute(
    slug: string,
    dto: UseSquadTemplateDto,
    locale: LocaleCode,
    context: RequestContext,
  ): Promise<SquadDescription> {
    const entry = findSquadTemplate(slug);
    if (!entry) throw new NotFoundError('Squad template', slug);
    const template = localizeSquadTemplate(entry, locale);
    return this.create.execute(
      {
        name: dto.name ?? template.name,
        goal: dto.goal ?? template.goal,
        member_slugs: [...template.member_slugs],
        lead_type: template.lead_type,
        lead_agent_slug: null,
        template_slug: template.slug,
      },
      context,
    );
  }
}
