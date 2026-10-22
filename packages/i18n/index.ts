export * from './copy_lint';
export * from './format_message';
export * from './key_usage';
export * from './locales';
export * from './pseudo';
export * from './resolve';
export * from './translator';

import type { LocaleDefinition } from './locales';
import { flattenMessages, type Messages } from './translator';

export interface IncompleteLocale {
  locale: string;
  reason: 'missing_catalog' | 'missing_keys';
  keys: string[];
}

/**
 * Enabling a locale is only allowed with a complete catalog (FR-UX-37a): every
 * enabled locale needs a catalog and every key any enabled catalog has. A
 * disabled locale may be partial, which is how a language is prepared.
 */
export function findIncompleteLocales(
  registry: readonly LocaleDefinition[],
  catalogs: Record<string, Messages>,
): IncompleteLocale[] {
  const enabled = registry.filter((l) => l.enabled);
  const flats = new Map<string, Record<string, string>>();
  for (const { code } of enabled) {
    const catalog = catalogs[code];
    if (catalog) flats.set(code, flattenMessages(catalog));
  }
  const union = new Set([...flats.values()].flatMap((flat) => Object.keys(flat)));

  const problems: IncompleteLocale[] = [];
  for (const { code } of enabled) {
    const flat = flats.get(code);
    if (!flat) {
      problems.push({ locale: code, reason: 'missing_catalog', keys: [] });
      continue;
    }
    const keys = [...union].filter((key) => !(key in flat)).sort();
    if (keys.length > 0) problems.push({ locale: code, reason: 'missing_keys', keys });
  }
  return problems;
}
