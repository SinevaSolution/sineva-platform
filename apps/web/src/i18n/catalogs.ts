import type { LocaleCode, Messages } from '@sineva/i18n';
import en from '../../messages/en.json';
import id from '../../messages/id.json';

// One catalog per enabled locale, authored together in the same change. There
// is no fallback chain between them: see `createTranslator`.
export const CATALOGS: Record<LocaleCode, Messages> = { en, id };

export function messagesFor(locale: LocaleCode): Messages {
  return CATALOGS[locale];
}
