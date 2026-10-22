'use client';

import * as React from 'react';
import { Provider } from 'react-redux';
import { Toaster } from 'sonner';
import { ThemeFollowSystem } from '@/client/components/theme_follow_system';
import { TooltipProvider } from '@/client/components/ui/tooltip';
import { useTheme } from '@/client/lib/use_theme';
import { makeStore, type AppStore } from './store';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [store] = React.useState<AppStore>(() => makeStore());
  const { theme } = useTheme();

  return (
    <Provider store={store}>
      <ThemeFollowSystem />
      <TooltipProvider delayDuration={350} skipDelayDuration={150}>
        {children}
      </TooltipProvider>
      <Toaster position="bottom-right" richColors closeButton theme={theme} />
    </Provider>
  );
}
