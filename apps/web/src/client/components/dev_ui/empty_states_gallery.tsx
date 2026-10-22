'use client';

import { PresetEmptyState } from '@/client/components/ui/empty_state';
import { useTranslations } from '@/i18n/provider';
import { EMPTY_STATES, type EmptyPreset, type EmptyStateName } from '@/client/components/ui/empty_states';

/**
 * Every preset in the empty-state registry, with the message it reads in the
 * gallery's current language. Actions are wired to inert targets so the
 * buttons render as they do in the app.
 */
export function EmptyStatesGallery() {
  const t = useTranslations('dev_ui');
  const names = Object.keys(EMPTY_STATES) as EmptyStateName[];
  return (
    <section aria-labelledby="gallery-empty-states" className="space-y-8">
      <h2 id="gallery-empty-states" className="text-lg font-semibold text-text">
        {t('empty_states')}
      </h2>
      <ul className="grid gap-6 md:grid-cols-2">
        {names.map((name) => {
          const preset: EmptyPreset = EMPTY_STATES[name];
          return (
            <li key={name} className="space-y-2 rounded-md border border-border p-4">
              <p className="font-mono text-xs text-text-tertiary">{`${name} · ${preset.size}`}</p>
              <PresetEmptyState preset={name} values={preset.sample} actionHref="#" headingLevel={3} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
