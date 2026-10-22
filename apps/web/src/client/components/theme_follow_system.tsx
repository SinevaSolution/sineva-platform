'use client';

import * as React from 'react';
import { applyTheme, storedTheme } from '@sineva/ui/theme';

/**
 * Without a stored choice the page keeps following the operating system, also
 * when it flips while the page is open. A stored choice always wins, so the
 * listener ignores the change once the person has picked a theme.
 */
export function ThemeFollowSystem() {
  React.useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const follow = (event: MediaQueryListEvent) => {
      if (!storedTheme()) applyTheme(event.matches ? 'dark' : 'light', false);
    };
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);
  return null;
}
