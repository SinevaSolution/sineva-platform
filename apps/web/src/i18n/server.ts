import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, resolveLocale, type LocaleCode } from '@sineva/i18n';
import { getGetProfileUseCase } from '@/server/container';
import { getPageSession } from '@/server/http/page_session';
import { messagesFor } from './catalogs';
import { createAppTranslator, type AppTranslator } from './translate';

/**
 * Locale for this request: the signed-in person's `users.locale`, then the
 * locale cookie, then Accept-Language (FR-UX-33, no URL prefix). Cached per
 * request so the layout, page and metadata share one profile lookup.
 *
 * A failed profile lookup only skips that signal: the page's own data
 * loading reports a real outage, and a wrong language beats a blank screen
 * for the one call that exists to pick a language.
 */
export const getLocale = cache(async (): Promise<LocaleCode> => {
  const [cookieStore, headerStore, session] = await Promise.all([cookies(), headers(), getPageSession()]);
  let profile: string | null = null;
  if (session) {
    try {
      profile = (await getGetProfileUseCase().execute(session.user_id)).locale;
    } catch {
      profile = null;
    }
  }
  return resolveLocale({
    profile,
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get('accept-language'),
  });
});

export async function getMessages() {
  return messagesFor(await getLocale());
}

/** Server-component counterpart of `useTranslations`. */
export async function getTranslations(namespace: string): Promise<AppTranslator> {
  const locale = await getLocale();
  return createAppTranslator(messagesFor(locale), namespace, locale);
}
