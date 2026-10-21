'use client';

import * as React from 'react';
import { Provider } from 'react-redux';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/client/components/ui/tooltip';
import { makeStore, type AppStore } from './store';

// Suppress React 19 false-positive warning for next-themes' inline script tag during SSR/hydration
if (process.env.NODE_ENV === 'development') {
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Encountered a script tag')
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [store] = React.useState<AppStore>(() => makeStore());

  return (
    <Provider store={store}>
      <ThemeProvider
        attribute="data-theme"
        defaultTheme="light"
        enableSystem={false}
        disableTransitionOnChange
      >
        <TooltipProvider delayDuration={350} skipDelayDuration={150}>
          {children}
        </TooltipProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </ThemeProvider>
    </Provider>
  );
}
