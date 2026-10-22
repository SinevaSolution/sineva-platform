'use client';

import * as React from 'react';
import type { Messages } from '@sineva/i18n';
import { createAppTranslator, type AppTranslator } from './translate';

interface I18nContextValue {
  locale: string;
  messages: Messages;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

/**
 * Hands the resolved locale and its catalog to client components. The root
 * layout resolves both on the server (profile, cookie, Accept-Language), so
 * the first paint is already in the right language with no flash.
 */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: Messages;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nContextValue {
  const value = React.useContext(I18nContext);
  if (!value) {
    throw new Error('useTranslations needs an I18nProvider above it (the root layout provides one)');
  }
  return value;
}

export function useLocale(): string {
  return useI18n().locale;
}

export function useTranslations(namespace: string): AppTranslator {
  const { locale, messages } = useI18n();
  return React.useMemo(() => createAppTranslator(messages, namespace, locale), [messages, namespace, locale]);
}
