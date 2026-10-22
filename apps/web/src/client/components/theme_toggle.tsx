'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@sineva/ui';
import { useTheme } from '@/client/lib/use_theme';
import { useTranslations } from '@/i18n/provider';

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const t = useTranslations('common');
  const { theme, toggle } = useTheme();
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
      onClick={toggle}
      aria-label={isDark ? t('theme.aria_to_light') : t('theme.aria_to_dark')}
      title={isDark ? t('theme.title_to_light') : t('theme.title_to_dark')}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-warning" />
      ) : (
        <Moon className="h-4 w-4 text-text-brand" />
      )}
    </Button>
  );
}
