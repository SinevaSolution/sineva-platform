'use client';

import { useTheme } from 'next-themes';
import * as React from 'react';
import { toast } from 'sonner';
import { savePreferences } from '@/client/lib/preferences';
import { themeToApply } from '@/client/lib/preference_sync_model';
import { useApiErrorText } from '@/client/lib/use_api_error';
import type { PreferencesView } from '@/shared/profile_view';

const SYNCED_KEY = 'sineva-theme-synced';

// Storage can throw (private window, blocked site data); the sync then simply
// runs once per page load instead of once per session.
function readSynced(): boolean {
  try {
    return window.sessionStorage.getItem(SYNCED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSynced(): void {
  try {
    window.sessionStorage.setItem(SYNCED_KEY, '1');
  } catch {
    // Nothing to do: see readSynced.
  }
}

/**
 * Applies the theme stored on the account once per session, so a second
 * device picks up the choice made on the first. next-themes keeps the choice
 * in `localStorage` and sets `data-theme` before paint; this only nudges it
 * when the account says something explicit and different.
 */
export function ThemeSync({ stored }: { stored: PreferencesView['theme'] }) {
  const { theme, setTheme } = useTheme();
  const decided = React.useRef(false);

  React.useEffect(() => {
    // `theme` is undefined on the very first render; wait for next-themes.
    if (decided.current || theme === undefined) return;
    decided.current = true;
    const next = themeToApply({ stored, local: theme, alreadySynced: readSynced() });
    writeSynced();
    if (next) setTheme(next);
  }, [stored, theme, setTheme]);

  return null;
}

/**
 * The theme, with a setter that also saves the choice to the account. The
 * local change is immediate (next-themes); a failed save is reported but does
 * not undo what the person sees, because the choice still holds on this device.
 */
export function usePersistedTheme() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const errorText = useApiErrorText();

  const choose = React.useCallback(
    (next: PreferencesView['theme']) => {
      setTheme(next);
      savePreferences({ theme: next }).catch((error: unknown) => toast.error(errorText(error)));
    },
    [setTheme, errorText],
  );

  return { theme: theme as PreferencesView['theme'] | undefined, isDark: resolvedTheme === 'dark', choose };
}
