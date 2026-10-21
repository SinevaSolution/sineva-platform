'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@sineva/ui';

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <Button
        variant="secondary"
        size="icon"
        aria-label="Toggle color theme"
        disabled
      >
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const isDark = theme === 'dark';

  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={
        isDark
          ? 'Switch to warm light theme'
          : 'Switch to deep teal dark theme'
      }
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-[var(--sun-500)]" />
      ) : (
        <Moon className="h-4 w-4 text-[var(--teal-700)]" />
      )}
    </Button>
  );
}
