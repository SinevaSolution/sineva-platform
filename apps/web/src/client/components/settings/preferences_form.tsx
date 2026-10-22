'use client';

import { Check } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { usePersistedTheme } from '@/client/components/theme_sync';
import { cn } from '@/client/components/ui/cn';
import { Switch } from '@/client/components/ui/controls';
import { savePreferences } from '@/client/lib/preferences';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import type { PreferencesView } from '@/shared/profile_view';
import { SettingsRow, SettingsSection } from './settings_layout';

type Theme = PreferencesView['theme'];
type Density = PreferencesView['density'];
type FlagKey = 'reduce_motion' | 'pause_character' | 'focus_mode' | 'room_view';

const THEMES: readonly Theme[] = ['light', 'dark', 'system'];
const DENSITIES: readonly Density[] = ['comfortable', 'compact'];

// A miniature app window. The light and dark previews use fixed token layers
// (`--ink-*` primitives for light, a nested `data-theme="dark"` for dark), so
// each card looks the same whatever theme the page is in.
function ThemePreview({ kind }: { kind: 'light' | 'dark' }) {
  return (
    <span
      {...(kind === 'dark' ? { 'data-theme': 'dark' } : {})}
      className={cn(
        'flex h-full w-full gap-1.5 p-2',
        kind === 'dark' ? 'bg-canvas' : 'bg-[var(--ink-50)]',
      )}
    >
      <span className={cn('w-4 shrink-0 rounded-sm', kind === 'dark' ? 'bg-surface-alt' : 'bg-[var(--ink-100)]')} />
      <span
        className={cn(
          'flex min-w-0 flex-1 flex-col gap-1 rounded-md p-1.5',
          kind === 'dark' ? 'bg-surface' : 'bg-[var(--color-text-inverse)]',
        )}
      >
        <span className={cn('h-1.5 w-2/3 rounded-full', kind === 'dark' ? 'bg-fg' : 'bg-[var(--ink-950)]')} />
        <span className={cn('h-1 w-full rounded-full', kind === 'dark' ? 'bg-line-strong' : 'bg-[var(--ink-200)]')} />
        <span className={cn('h-1 w-5/6 rounded-full', kind === 'dark' ? 'bg-line-strong' : 'bg-[var(--ink-200)]')} />
        <span className="mt-auto h-2.5 w-8 rounded-sm bg-[var(--teal-700)]" />
      </span>
    </span>
  );
}

function ThemeSwatch({ theme }: { theme: Theme }) {
  if (theme === 'system') {
    // Half and half: the left half is the light preview, the right half the dark one.
    return (
      <span className="relative block h-full w-full">
        <span className="absolute inset-0 [clip-path:polygon(0_0,55%_0,45%_100%,0_100%)]">
          <ThemePreview kind="light" />
        </span>
        <span className="absolute inset-0 [clip-path:polygon(55%_0,100%_0,100%_100%,45%_100%)]">
          <ThemePreview kind="dark" />
        </span>
      </span>
    );
  }
  return <ThemePreview kind={theme} />;
}

export function PreferencesForm({ initial }: { initial: PreferencesView }) {
  const t = useTranslations('account');
  const errorText = useApiErrorText();
  const { theme, choose } = usePersistedTheme();
  const [prefs, setPrefs] = React.useState(initial);
  const id = React.useId();

  // next-themes knows the device's choice only after mount; until then the
  // account value stands in, which also keeps the server render stable.
  const activeTheme: Theme = theme ?? prefs.theme;

  async function update(patch: Partial<PreferencesView>) {
    const before = prefs;
    setPrefs((p) => ({ ...p, ...patch }));
    try {
      setPrefs(await savePreferences(patch));
    } catch (error) {
      // Put the control back where the server still has it.
      setPrefs(before);
      toast.error(errorText(error));
    }
  }

  function themeLabel(value: Theme): string {
    switch (value) {
      case 'light':
        return t('preferences.theme_light');
      case 'dark':
        return t('preferences.theme_dark');
      case 'system':
        return t('preferences.theme_system');
    }
  }

  function densityLabel(value: Density): string {
    return value === 'compact' ? t('preferences.density_compact') : t('preferences.density_comfortable');
  }

  const flags: Array<{ key: FlagKey; label: string; helper: string }> = [
    { key: 'reduce_motion', label: t('preferences.reduce_motion'), helper: t('preferences.reduce_motion_helper') },
    { key: 'pause_character', label: t('preferences.pause_character'), helper: t('preferences.pause_character_helper') },
    { key: 'focus_mode', label: t('preferences.focus_mode'), helper: t('preferences.focus_mode_helper') },
    { key: 'room_view', label: t('preferences.room_view'), helper: t('preferences.room_view_helper') },
  ];

  return (
    <div className="space-y-9">
      <SettingsSection title={t('preferences.section_appearance')}>
        <SettingsRow label={t('preferences.theme')} helper={t('preferences.theme_helper')}>
          <div role="radiogroup" aria-label={t('preferences.theme')} className="grid grid-cols-3 gap-2.5 sm:max-w-[420px]">
            {THEMES.map((value) => {
              const selected = activeTheme === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setPrefs((p) => ({ ...p, theme: value }));
                    choose(value);
                  }}
                  className={cn(
                    'group flex flex-col gap-2 rounded-xl border p-1.5 text-left transition-[border-color,box-shadow]',
                    selected
                      ? 'border-[var(--color-focus)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-focus)_18%,transparent)]'
                      : 'border-line-strong hover:border-[var(--color-text-tertiary)]',
                  )}
                >
                  <span className="block aspect-[4/3] overflow-hidden rounded-lg border border-line">
                    <ThemeSwatch theme={value} />
                  </span>
                  <span className="flex items-center justify-between px-1 pb-0.5 text-[13px] font-medium text-fg">
                    {themeLabel(value)}
                    {selected ? <Check aria-hidden="true" className="size-3.5 text-fg-brand" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </SettingsRow>
        <SettingsRow label={t('preferences.density')} helper={t('preferences.density_helper')}>
          <div
            role="radiogroup"
            aria-label={t('preferences.density')}
            className="inline-flex rounded-lg bg-surface-alt p-1"
          >
            {DENSITIES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={prefs.density === value}
                onClick={() => void update({ density: value })}
                className={cn(
                  'h-9 rounded-md px-3.5 text-[13px] font-medium transition-colors',
                  prefs.density === value ? 'bg-surface text-fg shadow-panel' : 'text-fg-secondary hover:text-fg',
                )}
              >
                {densityLabel(value)}
              </button>
            ))}
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t('preferences.section_motion')} delay={80}>
        {flags.map((flag) => (
          <SettingsRow key={flag.key} inline label={flag.label} helper={flag.helper} htmlFor={`${id}-${flag.key}`}>
            <Switch
              id={`${id}-${flag.key}`}
              checked={prefs[flag.key]}
              aria-describedby={`${id}-${flag.key}-helper`}
              onCheckedChange={(checked) => void update({ [flag.key]: checked })}
            />
          </SettingsRow>
        ))}
      </SettingsSection>
    </div>
  );
}
