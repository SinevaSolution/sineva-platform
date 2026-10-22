'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@sineva/ui';
import { useTranslations } from '@/i18n/provider';

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const t = useTranslations('common');
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
        aria-label={t('theme.toggle')}
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
      aria-label={isDark ? t('theme.aria_to_light') : t('theme.aria_to_dark')}
      title={isDark ? t('theme.title_to_light') : t('theme.title_to_dark')}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-[var(--sun-500)]" />
      ) : (
        <Moon className="h-4 w-4 text-[var(--teal-700)]" />
      )}
    </Button>
  );
}
