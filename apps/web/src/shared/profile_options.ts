// Profile rules that the server validates and the profile form mirrors. They
// live here, pure and framework-free, so both sides read one definition and
// the form never sends a request the server is certain to refuse.

export const SALUTATIONS = ['none', 'pak', 'bu', 'kak', 'mas', 'mbak'] as const;

export const DEPARTMENTS = [
  'management',
  'finance',
  'sales',
  'marketing',
  'operations',
  'hr',
  'it',
  'customer_support',
  'legal',
  'other',
] as const;

export const FULL_NAME_MIN = 2;
export const FULL_NAME_MAX = 100;
export const PREFERRED_NAME_MAX = 40;
export const ABOUT_ME_MAX = 280;
export const JOB_TITLE_MAX = 60;

// Letters of any script, combining marks, space, apostrophe (straight and
// typographic), period and hyphen. Digits and markup are refused so a name
// never carries a number or tags into emails, audit rows or prompts.
export const NAME_CHARS = /^[\p{L}\p{M}'’. -]+$/u;

/** Length in characters, not UTF-16 units: an emoji counts as one. */
export const charCount = (value: string): number => [...value].length;

/**
 * Normalises a phone number to E.164, or returns null when it is not one.
 * Separators (space, dash, dot, parentheses) are dropped. `0` is the Indonesian
 * trunk prefix (`0812...` is `+62812...`), `00` is the international call
 * prefix, a bare `62...` is read as Indonesian. Any other number must already
 * carry its `+country` code: guessing a country for `4155552671` would store a
 * wrong number silently. E.164 allows 8 to 15 digits after `+`, first digit
 * non-zero. Verification is a separate flow; this only checks the shape.
 */
export function normalizePhoneNumber(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, '');
  let digits: string;
  if (compact.startsWith('+')) {
    digits = compact.slice(1);
  } else if (compact.startsWith('00')) {
    digits = compact.slice(2);
  } else if (compact.startsWith('0')) {
    digits = `62${compact.slice(1)}`;
  } else if (compact.startsWith('62')) {
    digits = compact;
  } else {
    return null;
  }
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}
