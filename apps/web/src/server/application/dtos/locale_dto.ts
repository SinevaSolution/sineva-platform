import { z } from 'zod';
import { isEnabledLocale } from '@sineva/i18n';

// Validated against the locale registry rather than a hardcoded pair, so
// enabling a language in `packages/i18n/locales.ts` is the only change needed
// for the API to accept it. Case matters: codes are stored lowercase.
export const LocaleSchema = z.string().refine((value) => isEnabledLocale(value), {
  message: 'Unsupported language',
});
