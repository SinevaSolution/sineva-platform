'use client';

import { useTranslations } from '@/i18n/provider';
import { apiErrorKey } from './api';

/**
 * Turns a failed call into text in the UI language. The copy comes from the
 * machine code (`apiErrorKey`), never from the server's English `message`.
 */
export function useApiErrorText(): (error: unknown) => string {
  const t = useTranslations('errors');
  return (error) => t(apiErrorKey(error));
}
