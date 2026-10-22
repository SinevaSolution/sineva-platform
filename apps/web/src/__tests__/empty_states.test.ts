import { describe, expect, it } from 'vitest';
import { flattenMessages, lintCopyString } from '@sineva/i18n';
import { EMPTY_STATES, emptyStateKeys, type EmptyPreset } from '@/client/components/ui/empty_states';
import en from '../../messages/en.json';
import id from '../../messages/id.json';

const catalogs = { en: flattenMessages(en), id: flattenMessages(id) } as const;

describe('empty state presets', () => {
  const entries = Object.entries(EMPTY_STATES) as Array<[string, EmptyPreset]>;

  it('has presets', () => {
    expect(entries.length).toBeGreaterThanOrEqual(15);
  });

  it.each(entries)('%s has a title and a sentence in English and Indonesian', (name, preset) => {
    for (const locale of ['en', 'id'] as const) {
      for (const key of emptyStateKeys(preset)) {
        const value = catalogs[locale][`empty.${key}`];
        expect(value, `${locale} empty.${key}`).toBeTruthy();
        expect(lintCopyString(value, { locale, key: `empty.${key}` }), `${locale} ${key}`).toEqual([]);
      }
    }
    expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it.each(entries)('%s shows exactly one visual: a Sino pose or an icon, never both', (_name, preset) => {
    expect(Boolean(preset.icon) !== Boolean(preset.pose)).toBe(true);
  });

  it('keeps compact places on icons and whole pages on Sino poses', () => {
    for (const preset of (Object.values(EMPTY_STATES) as EmptyPreset[])) {
      if (preset.size === 'sm') expect(preset.icon).toBeTruthy();
      if (preset.size === 'lg') expect(preset.pose).toBeTruthy();
    }
  });

  it('has no copy in the catalog that the registry does not know', () => {
    const known = new Set(Object.keys(EMPTY_STATES));
    for (const locale of ['en', 'id'] as const) {
      const names = new Set(
        Object.keys(catalogs[locale])
          .filter((k) => k.startsWith('empty.'))
          .map((k) => k.split('.')[1]),
      );
      expect([...names].filter((n) => !known.has(n))).toEqual([]);
    }
  });

  it('never uses "nothing here" style filler', () => {
    for (const preset of (Object.values(EMPTY_STATES) as EmptyPreset[])) {
      const text = `${catalogs.en[`empty.${preset.title}`]} ${catalogs.en[`empty.${preset.description}`]}`;
      expect(text.toLowerCase()).not.toMatch(/nothing here|nothing to show|no data/);
    }
  });
});
