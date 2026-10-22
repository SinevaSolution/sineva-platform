import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALES,
  enabledLocaleCodes,
  findIncompleteLocales,
  intlLocaleFor,
  isEnabledLocale,
  parseAcceptLanguage,
  resolveLocale,
  type LocaleDefinition,
} from '@sineva/i18n';
import en from '../../messages/en.json';
import id from '../../messages/id.json';

const FRENCH: LocaleDefinition = { code: 'fr', native_name: 'Francais', intl_locale: 'fr-FR', enabled: true };

describe('locale registry', () => {
  it('enables Indonesian and English and nothing else in v1.0', () => {
    expect(enabledLocaleCodes().sort()).toEqual(['en', 'id']);
  });

  it('validates codes against the registry, not a hardcoded pair', () => {
    expect(isEnabledLocale('id')).toBe(true);
    expect(isEnabledLocale('fr')).toBe(false);
    expect(isEnabledLocale('fr', [...LOCALES, FRENCH])).toBe(true);
    expect(isEnabledLocale('fr', [{ ...FRENCH, enabled: false }])).toBe(false);
  });

  it('maps a code to its Intl locale', () => {
    expect(intlLocaleFor('id')).toBe('id-ID');
    expect(intlLocaleFor('en')).toBe('en-US');
  });

  it('ships a complete catalog for every enabled locale', () => {
    expect(findIncompleteLocales(LOCALES, { en, id })).toEqual([]);
  });

  it('fails when a locale is enabled without a catalog (FR-UX-37a)', () => {
    const problems = findIncompleteLocales([...LOCALES, FRENCH], { en, id });
    expect(problems).toEqual([{ locale: 'fr', reason: 'missing_catalog', keys: [] }]);
  });

  it('fails when an enabled locale lacks keys the others have', () => {
    const partial = { ...id, common: {} };
    const problems = findIncompleteLocales(LOCALES, { en, id: partial });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ locale: 'id', reason: 'missing_keys' });
    expect(problems[0]!.keys.length).toBeGreaterThan(0);
  });

  it('ignores catalogs of disabled locales', () => {
    expect(findIncompleteLocales([...LOCALES, { ...FRENCH, enabled: false }], { en, id })).toEqual([]);
  });
});

describe('parseAcceptLanguage', () => {
  it('orders tags by quality and lowercases them', () => {
    expect(parseAcceptLanguage('en-US;q=0.5, id-ID, fr;q=0.9')).toEqual(['id-id', 'fr', 'en-us']);
  });

  it('ignores wildcard, malformed and zero-quality entries', () => {
    expect(parseAcceptLanguage('*, ;q=1, de;q=0, id;q=abc')).toEqual([]);
  });

  it('returns nothing for a missing header', () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage('')).toEqual([]);
  });
});

describe('resolveLocale', () => {
  it('prefers the profile locale over cookie and header', () => {
    expect(resolveLocale({ profile: 'id', cookie: 'en', acceptLanguage: 'en-US' })).toBe('id');
  });

  it('falls back to the cookie when there is no profile locale', () => {
    expect(resolveLocale({ profile: null, cookie: 'id', acceptLanguage: 'en-US' })).toBe('id');
  });

  it('skips a profile or cookie value the registry does not enable', () => {
    expect(resolveLocale({ profile: 'fr', cookie: 'id' })).toBe('id');
    expect(resolveLocale({ profile: 'fr', cookie: 'de', acceptLanguage: 'id-ID' })).toBe('id');
  });

  it('uses Accept-Language by primary subtag, so id-ID and the legacy "in" both give Indonesian', () => {
    expect(resolveLocale({ acceptLanguage: 'id-ID,id;q=0.9,en;q=0.5' })).toBe('id');
    expect(resolveLocale({ acceptLanguage: 'en-GB' })).toBe('en');
    expect(resolveLocale({ acceptLanguage: 'in' })).toBe('id');
  });

  it('takes the first supported entry, not the first entry', () => {
    expect(resolveLocale({ acceptLanguage: 'fr-FR, id;q=0.8' })).toBe('id');
  });

  it('uses the default when nothing matches', () => {
    expect(resolveLocale({ acceptLanguage: 'fr-FR' })).toBe(DEFAULT_LOCALE);
    expect(resolveLocale({})).toBe(DEFAULT_LOCALE);
  });
});
