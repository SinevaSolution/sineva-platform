import type { LocaleCode } from '@sineva/i18n';
import { localizeSquadTemplates, type LocalizedSquadTemplate } from '@/shared/squads/templates';

export class ListSquadTemplatesUseCase {
  /** Only starter members are ever returned, so no unreleased specialist is listed (FR-SQD-03). */
  execute(locale: LocaleCode): { items: LocalizedSquadTemplate[] } {
    return { items: localizeSquadTemplates(locale) };
  }
}
