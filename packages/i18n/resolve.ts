import { DEFAULT_LOCALE, LOCALES, isEnabledLocale, type LocaleCode, type LocaleDefinition } from './locales';

/**
 * Tags from an Accept-Language header, best first, lowercased. Entries that
 * are malformed, have `q=0` or are the `*` wildcard are dropped. Equal
 * quality keeps header order (a stable sort), which is what browsers intend.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part, index) => {
      const [rawTag = '', ...params] = part.trim().split(';');
      const tag = rawTag.trim().toLowerCase();
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam === undefined ? 1 : Number(qParam.slice(2));
      return { tag, q, index };
    })
    .filter(({ tag, q }) => /^[a-z]{2,3}(-[a-z0-9]+)*$/.test(tag) && Number.isFinite(q) && q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map(({ tag }) => tag);
}

// ISO 639 still has the pre-1989 code `in` for Indonesian and some older
// browsers and Android builds send it.
const LEGACY_PRIMARY_TAGS: Record<string, string> = { in: 'id' };

export interface LocaleSignals {
  /** `users.locale` of the signed-in person. Wins over everything. */
  profile?: string | null;
  /** Value of the locale cookie. */
  cookie?: string | null;
  /** Raw Accept-Language header. */
  acceptLanguage?: string | null;
}

/**
 * Profile, then cookie, then Accept-Language (FR-UX-33: no URL prefix). Every
 * candidate must be enabled in the registry, so a stale cookie or a profile
 * value from a retired locale falls through instead of breaking the page.
 */
export function resolveLocale(
  signals: LocaleSignals,
  registry: readonly LocaleDefinition[] = LOCALES,
): LocaleCode {
  for (const candidate of [signals.profile, signals.cookie]) {
    if (isEnabledLocale(candidate, registry)) return candidate;
  }
  for (const tag of parseAcceptLanguage(signals.acceptLanguage)) {
    const primary = tag.split('-')[0] ?? tag;
    const code = LEGACY_PRIMARY_TAGS[primary] ?? primary;
    if (isEnabledLocale(code, registry)) return code;
  }
  return DEFAULT_LOCALE;
}
