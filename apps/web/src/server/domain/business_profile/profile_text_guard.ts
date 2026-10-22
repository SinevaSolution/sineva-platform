import { ValidationError } from '@/server/domain/errors/domain_error';

// Guard over the free text of the Business Profile (FR-ONB-19, FR-ONB-20).
//
// Two kinds of finding, handled differently on purpose:
// - warnings (instruction-like text, special categories of personal data) are
//   a conservative keyword heuristic. They only warn the owner and the text is
//   still saved: a heuristic that blocked would reject honest copy ("we sell
//   halal food", "our clinic treats diabetes") and cannot be exhaustive anyway.
//   Nothing in the profile executes; guardrails are code, not prompts.
// - a national identity number (NIK) is rejected, because the profile is
//   business data and no specialist ever needs a person's ID number.

export type ProfileWarningCode = 'instruction_like' | 'special_category';

export interface ProfileWarning {
  field: string;
  code: ProfileWarningCode;
  category?: string;
}

const INSTRUCTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(instructions?|rules?|limits?|guardrails?|policies|prompt)\b/i,
  /\b(abaikan|lupakan|langgar|jangan\s+ikuti)\b[^.\n]{0,40}\b(instruksi|aturan|batasan|pedoman|perintah)\b/i,
  /\bsystem\s+prompt\b/i,
  /\b(you\s+are\s+now|from\s+now\s+on\s+you)\b/i,
  /\b(kamu|anda)\s+sekarang\s+adalah\b/i,
];

const SPECIAL_CATEGORY_PATTERNS: Array<{ category: string; pattern: RegExp }> = [
  { category: 'health', pattern: /\b(diabet\w*|hiv|aids|cancer|kanker|depress\w*|sakit\s+jiwa|medical\s+(condition|record)|rekam\s+medis|penyakit)\b/i },
  { category: 'religion', pattern: /\b(agama|religion|religious|muslim|kristen|christian|hindu|buddha|katolik|catholic|atheis\w*)\b/i },
  { category: 'political', pattern: /\b(partai|political\s+(view|views|party|affiliation)|pilihan\s+politik)\b/i },
  { category: 'biometric', pattern: /\b(sidik\s+jari|fingerprints?|biometri\w*)\b/i },
  { category: 'children', pattern: /\b(anak\s+di\s+bawah\s+umur|children'?s\s+data|data\s+anak|minors?)\b/i },
  { category: 'ethnicity', pattern: /\b(suku|etnis|ethnic\w*)\b/i },
  { category: 'criminal', pattern: /\b(catatan\s+kriminal|criminal\s+record)\b/i },
];

const NIK_PROVINCES = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 31, 32, 33, 34, 35, 36, 51, 52, 53, 61, 62, 63, 64, 65, 71, 72, 73,
  74, 75, 76, 81, 82, 91, 92, 93, 94, 95, 96,
]);

// Same plausibility rules as the PII detector of `@sineva/shared` (province,
// birth day with +40 for women, month, serial). Re-stated here because the
// domain layer must not import that package, and a bare 16 digit order number
// should not be rejected.
function looksLikeNik(digits: string): boolean {
  const province = Number(digits.slice(0, 2));
  const regency = Number(digits.slice(2, 4));
  const district = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const month = Number(digits.slice(8, 10));
  const serial = Number(digits.slice(12, 16));
  const dayOk = (day >= 1 && day <= 31) || (day >= 41 && day <= 71);
  return NIK_PROVINCES.has(province) && regency >= 1 && district >= 1 && dayOk && month >= 1 && month <= 12 && serial >= 1;
}

function containsNik(text: string): boolean {
  for (const match of text.matchAll(/(?<!\d)\d{16}(?!\d)/g)) {
    if (looksLikeNik(match[0])) {
      return true;
    }
  }
  return false;
}

/** Every free-text string of a set of profile values, labelled with the field it came from. */
export function collectProfileTexts(
  values: Partial<{
    display_name: string | null;
    legal_name: string | null;
    industry: string | null;
    city: string | null;
    province: string | null;
    audience: string | null;
    social_handles: Record<string, string | undefined> | null;
    business_hours: { note?: string } | null;
    brand_voice: { words_to_use?: string[]; words_to_avoid?: string[]; samples?: string[] } | null;
  }>,
): Array<{ field: string; text: string }> {
  const entries: Array<{ field: string; text: string }> = [];
  const push = (field: string, text: string | null | undefined) => {
    if (text) entries.push({ field, text });
  };
  push('display_name', values.display_name);
  push('legal_name', values.legal_name);
  push('industry', values.industry);
  push('city', values.city);
  push('province', values.province);
  push('audience', values.audience);
  for (const [key, value] of Object.entries(values.social_handles ?? {})) push(`social_handles.${key}`, value);
  push('business_hours.note', values.business_hours?.note);
  for (const word of values.brand_voice?.words_to_use ?? []) push('brand_voice.words_to_use', word);
  for (const word of values.brand_voice?.words_to_avoid ?? []) push('brand_voice.words_to_avoid', word);
  for (const sample of values.brand_voice?.samples ?? []) push('brand_voice.samples', sample);
  return entries;
}

/**
 * @throws ValidationError `sensitive_identifier` when an entry holds a NIK.
 * @returns warnings for the owner; an empty list for ordinary business text.
 */
export function inspectProfileText(entries: Array<{ field: string; text: string }>): ProfileWarning[] {
  const warnings: ProfileWarning[] = [];

  for (const { field, text } of entries) {
    if (containsNik(text)) {
      throw new ValidationError('Do not store identity numbers in the business profile.', [
        {
          code: 'sensitive_identifier',
          field,
          detail: 'Identity numbers are not stored in the business profile.',
        },
      ]);
    }
  }

  for (const { field, text } of entries) {
    if (INSTRUCTION_PATTERNS.some((pattern) => pattern.test(text))) {
      warnings.push({ field, code: 'instruction_like' });
    }
    const special = SPECIAL_CATEGORY_PATTERNS.find(({ pattern }) => pattern.test(text));
    if (special) {
      warnings.push({ field, code: 'special_category', category: special.category });
    }
  }
  return warnings;
}
