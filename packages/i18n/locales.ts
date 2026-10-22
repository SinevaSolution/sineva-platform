// The one registry of UI locales. Everything that needs a locale list
// (profile validation, workspace default locale, the language picker, the
// completeness check in CI) reads it from here, so enabling a language is a
// one-line change that the catalog check then holds to account.

export interface LocaleDefinition {
  /** BCP 47 primary tag stored on `users.locale` and in the locale cookie. */
  code: string;
  /** The language's own name, shown in the language picker. Never translated. */
  native_name: string;
  /** Locale passed to `Intl` for numbers, dates and plural rules. */
  intl_locale: string;
  /** A disabled locale can have a partial catalog; an enabled one cannot. */
  enabled: boolean;
}

// No `fallback` field on purpose: there is no cross-locale fallback. A missing
// key is a bug that CI catches, not something to paper over with English.
export const LOCALES = [
  { code: 'id', native_name: 'Bahasa Indonesia', intl_locale: 'id-ID', enabled: true },
  { code: 'en', native_name: 'English', intl_locale: 'en-US', enabled: true },
] as const satisfies readonly LocaleDefinition[];

export type LocaleCode = (typeof LOCALES)[number]['code'];

/**
 * What a visitor gets when no signal (profile, cookie, browser) names an
 * enabled locale. Indonesian browsers get `id` through Accept-Language before
 * this is ever reached.
 */
export const DEFAULT_LOCALE: LocaleCode = 'en';

/** Cookie that remembers the language for signed-out pages. Not HttpOnly: the profile form writes it. */
export const LOCALE_COOKIE = 'sineva_locale';

export function enabledLocaleCodes(registry: readonly LocaleDefinition[] = LOCALES): string[] {
  return registry.filter((l) => l.enabled).map((l) => l.code);
}

export function isEnabledLocale(code: unknown, registry: readonly LocaleDefinition[] = LOCALES): code is LocaleCode {
  return typeof code === 'string' && registry.some((l) => l.enabled && l.code === code);
}

export function intlLocaleFor(code: string, registry: readonly LocaleDefinition[] = LOCALES): string {
  const found = registry.find((l) => l.code === code);
  if (!found) {
    throw new Error(`Unknown locale "${code}": add it to packages/i18n/locales.ts`);
  }
  return found.intl_locale;
}
