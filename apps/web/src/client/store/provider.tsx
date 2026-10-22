'use client';

import * as React from 'react';
import { Provider } from 'react-redux';
import { ThemeFollowSystem } from '@/client/components/theme_follow_system';
import { SNToaster, SNTooltipProvider } from '@sineva/ui';
import { useTheme } from '@/client/lib/use_theme';
import { useTranslations } from '@/i18n/provider';
import { makeStore, type AppStore } from './store';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [store] = React.useState<AppStore>(() => makeStore());
  const { theme } = useTheme();
  const t = useTranslations('common');

  return (
    <Provider store={store}>
      <ThemeFollowSystem />
      <SNTooltipProvider delayDuration={350} skipDelayDuration={150}>
        {children}
      </SNTooltipProvider>
      <SNToaster theme={theme} closeLabel={t('close')} />
    </Provider>
  );
}
