'use client';

import * as React from 'react';
import {
  THEME_CHANGE_EVENT,
  applyThemePreference,
  readTheme,
  readThemePreference,
  type Theme,
  type ThemePreference,
} from '@sineva/ui/theme';

// The theme lives in `<html data-theme>`, put there by the inline script
// before first paint, and the choice in localStorage. Reading both (instead of
// copying them into React state) keeps the script, this hook and the CSS on one
// source of truth. A preference change to `system` may not change the
// attribute, so the change event covers that case.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    observer.disconnect();
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

export interface ThemeState {
  /** The theme on screen. `light` during server rendering and hydration. */
  theme: Theme;
  /** The choice: light, dark, or system (follow the OS). */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

export function useTheme(): ThemeState {
  const theme = React.useSyncExternalStore(subscribe, readTheme, (): Theme => 'light');
  const preference = React.useSyncExternalStore(
    subscribe,
    readThemePreference,
    (): ThemePreference => 'system',
  );
  const setPreference = React.useCallback((next: ThemePreference) => applyThemePreference(next), []);
  const setTheme = React.useCallback((next: Theme) => applyThemePreference(next), []);
  const toggle = React.useCallback(
    () => applyThemePreference(readTheme() === 'dark' ? 'light' : 'dark'),
    [],
  );
  return { theme, preference, setPreference, setTheme, toggle };
}
