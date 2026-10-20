'use client';

import * as React from 'react';
import { Provider } from 'react-redux';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { makeStore, type AppStore } from './store';

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
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </ThemeProvider>
    </Provider>
  );
}
