// Locale-aware formatting through `Intl` only (FR-UX-35). Callers pass the UI
// locale code (`id` or `en`); the Intl locale is derived here so no screen
// builds a number or date by hand.

export const DEFAULT_TIME_ZONE = 'Asia/Jakarta';

const INTL_LOCALES: Record<string, string> = { id: 'id-ID', en: 'en-US' };

function intl(locale: string): string {
  return INTL_LOCALES[locale] ?? locale;
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(intl(locale)).format(value);
}

/**
 * Rupiah as `Rp 1.500.000`: no decimals, Indonesian grouping in both UI
 * languages (the currency is Indonesian, so the writing of it does not change
 * with the interface language). The space is a no-break space so "Rp" never
 * wraps away from its number.
 */
export function formatIdr(amount: number, _locale?: string): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(
  value: Date | string | number,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(intl(locale), { timeZone: DEFAULT_TIME_ZONE, ...options }).format(new Date(value));
}

/**
 * "5 minutes ago" in the UI language, rounded to minutes, hours or days.
 * `now` is a parameter so tests do not depend on the clock.
 */
export function formatRelativeTime(value: Date | string | number, locale: string, now: Date = new Date()): string {
  const rtf = new Intl.RelativeTimeFormat(intl(locale), { numeric: 'auto' });
  const minutes = Math.round((new Date(value).getTime() - now.getTime()) / 60_000);
  if (minutes === 0) return rtf.format(0, 'second');
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}
