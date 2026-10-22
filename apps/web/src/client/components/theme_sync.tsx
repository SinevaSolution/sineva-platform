'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { savePreferences } from '@/client/lib/preferences';
import { themeToApply } from '@/client/lib/preference_sync_model';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTheme } from '@/client/lib/use_theme';
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
 * device picks up the choice made on the first. The inline theme script keeps
 * the choice in `localStorage` and sets `data-theme` before paint; this only
 * nudges it when the account says something explicit and different.
 */
export function ThemeSync({ stored }: { stored: PreferencesView['theme'] }) {
  const { preference, setPreference } = useTheme();
  const decided = React.useRef(false);

  React.useEffect(() => {
    if (decided.current) return;
    decided.current = true;
    const next = themeToApply({ stored, local: preference, alreadySynced: readSynced() });
    writeSynced();
    if (next) setPreference(next);
  }, [stored, preference, setPreference]);

  return null;
}

/**
 * The theme, with a setter that also saves the choice to the account. The
 * local change is immediate; a failed save is reported but does
 * not undo what the person sees, because the choice still holds on this device.
 */
export function usePersistedTheme() {
  const { theme, preference, setPreference } = useTheme();
  const errorText = useApiErrorText();

  const choose = React.useCallback(
    (next: PreferencesView['theme']) => {
      setPreference(next);
      savePreferences({ theme: next }).catch((error: unknown) => toast.error(errorText(error)));
    },
    [setPreference, errorText],
  );

  return { theme: preference as PreferencesView['theme'], isDark: theme === 'dark', choose };
}
