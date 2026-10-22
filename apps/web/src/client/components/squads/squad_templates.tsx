'use client';

import { SNButton, SNCard } from '@sineva/ui';
import { useTranslations } from '@/i18n/provider';
import type { ShellSpecialistView } from '@/shared/shell_view';
import type { SquadTemplateView } from '@/shared/squad_view';
import { SquadMemberTiles } from './squad_member_tiles';

/** The ready-made squads: members, a goal and three things to ask, so a first squad is one click. */
export function SquadTemplates({
  templates,
  specialists,
  onUse,
}: {
  templates: readonly SquadTemplateView[];
  specialists: readonly ShellSpecialistView[];
  onUse: (template: SquadTemplateView) => void;
}) {
  const t = useTranslations('squads_ui');
  return (
    <section aria-labelledby="squad-templates-title" className="space-y-3">
      <div>
        <h2 id="squad-templates-title" className="text-[15px] font-semibold text-text">
          {t('templates_title')}
        </h2>
        <p className="text-sm text-text-secondary">{t('templates_hint')}</p>
      </div>
      <ul className="grid gap-3 md:grid-cols-3">
        {templates.map((template) => (
          <li key={template.slug}>
            <SNCard className="flex h-full flex-col gap-3">
              <h3 className="text-[15px] font-semibold text-text">{template.name}</h3>
              <p className="text-sm text-text-secondary">{template.goal}</p>
              <SquadMemberTiles slugs={template.member_slugs} specialists={specialists} size="sm" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-text-secondary">{t('template_prompts')}</p>
                <ul className="list-disc space-y-0.5 ps-4 text-[13px] text-text-secondary">
                  {template.starter_prompts.map((prompt) => (
                    <li key={prompt}>{prompt}</li>
                  ))}
                </ul>
              </div>
              <SNButton className="mt-auto self-start" onClick={() => onUse(template)}>
                {t('use_template')}
              </SNButton>
            </SNCard>
          </li>
        ))}
      </ul>
    </section>
  );
}
