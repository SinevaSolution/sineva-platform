'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { SNIconButton } from '@sineva/ui';
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
      <SNIconButton variant="secondary" size="lg" label={t('theme.toggle')} disabled>
        <Sun aria-hidden="true" />
      </SNIconButton>
    );
  }

  const isDark = theme === 'dark';

  return (
    <SNIconButton
      variant="secondary"
      size="lg"
      onClick={toggle}
      label={isDark ? t('theme.aria_to_light') : t('theme.aria_to_dark')}
      tooltip={isDark ? t('theme.title_to_light') : t('theme.title_to_dark')}
    >
      {isDark ? <Sun aria-hidden="true" className="text-warning" /> : <Moon aria-hidden="true" className="text-text-brand" />}
    </SNIconButton>
  );
}
