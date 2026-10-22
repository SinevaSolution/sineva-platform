import { detectPii, type PiiKind } from './detectors';

/**
 * Stable replacement per kind. Fixed text (not a hash or a counter) so masked
 * output is deterministic and cannot be used to link two log lines to the same
 * person. Contains no digits, which keeps `mask` idempotent.
 */
export const PII_PLACEHOLDERS: Record<PiiKind, string> = {
  nik: '[NIK]',
  npwp: '[NPWP]',
  phone: '[PHONE]',
  bank_account: '[BANK_ACCOUNT]',
  email: '[EMAIL]',
  secret: '[SECRET]',
};

/**
 * Replaces Indonesian identifiers and secrets with placeholders. For logs,
 * traces, evals and support views only: business answers shown to the owner
 * are not masked (FR-SEC-19).
 */
export function mask(text: string): string {
  const matches = detectPii(text);
  if (matches.length === 0) {
    return text;
  }
  let out = '';
  let cursor = 0;
  for (const match of matches) {
    out += text.slice(cursor, match.start) + PII_PLACEHOLDERS[match.kind];
    cursor = match.end;
  }
  return out + text.slice(cursor);
}
