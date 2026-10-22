'use client';

import * as React from 'react';
import { applyTheme, readTheme, type Theme } from '@sineva/ui/theme';

// The theme lives in `<html data-theme>`, put there by the inline script
// before first paint. Reading the attribute (instead of copying it into React
// state) keeps the script, this hook and the CSS on one source of truth.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/** The current theme, plus setters. `light` during server rendering and hydration. */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void; toggle: () => void } {
  const theme = React.useSyncExternalStore(subscribe, readTheme, (): Theme => 'light');
  const setTheme = React.useCallback((next: Theme) => applyTheme(next), []);
  const toggle = React.useCallback(() => applyTheme(readTheme() === 'dark' ? 'light' : 'dark'), []);
  return { theme, setTheme, toggle };
}
