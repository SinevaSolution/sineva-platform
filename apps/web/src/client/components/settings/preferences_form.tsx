'use client';

import { Check } from 'lucide-react';
import * as React from 'react';
import { SNSegmented, SNSwitch, snToast } from '@sineva/ui';
import { usePersistedTheme } from '@/client/components/theme_sync';
import { cn } from '@/client/components/ui/cn';
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

// A miniature app window. The previews read fixed `--pv-*` tokens
// (app-density.css), not the live semantic tokens: the dark theme only applies
// at the root, so a nested data-theme could not show the other theme, and each
// card must look the same whatever theme the page is in.
function ThemePreview({ kind }: { kind: 'light' | 'dark' }) {
  return (
    <span data-theme-preview={kind} className="flex h-full w-full gap-1.5 bg-(--pv-canvas) p-2">
      <span className="w-4 shrink-0 rounded-xs bg-(--pv-rail)" />
      <span className="flex min-w-0 flex-1 flex-col gap-1 rounded-sm bg-(--pv-panel) p-1.5">
        <span className="h-1.5 w-2/3 rounded-full bg-(--pv-text)" />
        <span className="h-1 w-full rounded-full bg-(--pv-line)" />
        <span className="h-1 w-5/6 rounded-full bg-(--pv-line)" />
        <span className="mt-auto h-2.5 w-8 rounded-xs bg-(--pv-action)" />
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

  // The hook reads `system` while rendering on the server and before the
  // device's choice is known, so the account value stands in until a stored
  // choice exists. That keeps the server render stable.
  const activeTheme: Theme = theme === 'system' ? prefs.theme : theme;

  async function update(patch: Partial<PreferencesView>) {
    const before = prefs;
    setPrefs((p) => ({ ...p, ...patch }));
    try {
      setPrefs(await savePreferences(patch));
    } catch (error) {
      // Put the control back where the server still has it.
      setPrefs(before);
      snToast.error(errorText(error));
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
                    'group flex flex-col gap-2 rounded-xl border p-1.5 text-start transition-[border-color,box-shadow]',
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
          <SNSegmented
            aria-label={t('preferences.density')}
            value={prefs.density}
            onValueChange={(value) => void update({ density: value as Density })}
            options={DENSITIES.map((value) => ({ value, label: densityLabel(value) }))}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t('preferences.section_motion')} delay={80}>
        {flags.map((flag) => (
          <SettingsRow key={flag.key} inline label={flag.label} helper={flag.helper} htmlFor={`${id}-${flag.key}`}>
            <SNSwitch
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
