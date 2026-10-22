import redactionPatterns from '../redaction/redaction_patterns.json';

export type PiiKind = 'nik' | 'npwp' | 'phone' | 'bank_account' | 'email' | 'secret';

export interface PiiMatch {
  kind: PiiKind;
  /** Which secret pattern matched (`bearer`, `snv_pat`, an id from the redaction list). Secrets only. */
  pattern_id?: string;
  /** Inclusive start offset in the scanned text. */
  start: number;
  /** Exclusive end offset in the scanned text. */
  end: number;
}

interface Rule {
  kind: PiiKind;
  id?: string;
  pattern: RegExp;
  /** Extra check on the matched text; false drops the candidate. */
  accept?: (matched: string) => boolean;
}

// BPS province codes in use, including the 2022 Papua provinces (92 to 96).
// Used only as one of the NIK structure checks.
const NIK_PROVINCES = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 31, 32, 33, 34, 35, 36, 51, 52, 53, 61,
  62, 63, 64, 65, 71, 72, 73, 74, 75, 76, 81, 82, 91, 92, 93, 94, 95, 96,
]);

/**
 * NIK layout: PPRRDD DDMMYY SSSS (province, regency, district, birth day,
 * month, year, serial). Women have 40 added to the day. This is a plausibility
 * check, not validation: it exists so that arbitrary 16 digit order numbers and
 * card numbers are not masked when no keyword gives context.
 */
export function hasPlausibleNikStructure(digits: string): boolean {
  if (!/^\d{16}$/.test(digits)) {
    return false;
  }
  const province = Number(digits.slice(0, 2));
  const regency = Number(digits.slice(2, 4));
  const district = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const month = Number(digits.slice(8, 10));
  const serial = Number(digits.slice(12, 16));
  const dayOk = (day >= 1 && day <= 31) || (day >= 41 && day <= 71);
  return (
    NIK_PROVINCES.has(province) &&
    regency >= 1 &&
    district >= 1 &&
    dayOk &&
    month >= 1 &&
    month <= 12 &&
    serial >= 1
  );
}

// Keyword contexts use variable length lookbehind so the reported span is only
// the digits, and the keyword stays readable in the masked output.
const NIK_KEYWORD = String.raw`(?:nik|ktp|nomor\s+induk\s+kependudukan)`;
const BANK_KEYWORD = String.raw`(?:no\.?\s*rek(?:ening)?|rek(?:ening)?|norek|account\s*(?:number|no\.?|num(?:ber)?)|acc(?:ount)?\.?\s*no\.?|a\/c|virtual\s+account|bca|bni|bri|mandiri|cimb|permata|btn|bsi)`;

const DATA_SECRET_RULES: Rule[] = redactionPatterns.patterns.map((entry) => ({
  kind: 'secret' as const,
  id: entry.id,
  pattern: new RegExp(entry.pattern, `${entry.flags.replace('g', '')}g`),
}));

// Secrets come first in priority: a token that happens to contain a digit run
// must be reported as a secret, not as a phone number.
const RULES: Rule[] = [
  // PEM private keys. An unterminated block (a log line cut mid-key) masks to
  // the end of the text, because leaving the tail would leak key material.
  {
    kind: 'secret',
    id: 'pem_private_key',
    pattern:
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g,
  },
  { kind: 'secret', id: 'bearer', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi },
  { kind: 'secret', id: 'snv_pat', pattern: /\bsnv_pat_[A-Za-z0-9_-]{8,}/g },
  // `sk-` covers Anthropic (`sk-ant-`) and OpenAI style keys. The 20 character
  // floor keeps ordinary hyphenated words out.
  { kind: 'secret', id: 'model_key_sk', pattern: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { kind: 'secret', id: 'aws_access_key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'secret', id: 'google_api_key', pattern: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g },
  { kind: 'secret', id: 'github_token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}/g },
  { kind: 'secret', id: 'github_pat', pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}/g },
  { kind: 'secret', id: 'gitlab_pat', pattern: /\bglpat-[A-Za-z0-9_-]{20,}/g },
  { kind: 'secret', id: 'slack_token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  {
    kind: 'secret',
    id: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  },
  // Credential shapes kept as data (redaction/redaction_patterns.json): provider
  // keys, token endpoint bodies, OAuth callback values, Basic credentials and
  // webhook signatures. They sit with the other secret rules, before the PII
  // rules, so a token that happens to contain digits is a secret and not a phone.
  ...DATA_SECRET_RULES,
  {
    kind: 'email',
    // Local part and labels are length-bounded (RFC 5321: 64 and 63). An
    // unbounded `+` rescans to the end of the text from every start position,
    // which is quadratic on a long run of address characters with no `@`.
    pattern: /[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.){1,8}[A-Za-z]{2,24}/g,
  },
  // NPWP: the dotted layout is distinctive enough alone. Plain 15 or 16 digit
  // runs are indistinguishable from other numbers, so they need the keyword.
  { kind: 'npwp', pattern: /(?<!\d)\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}(?!\d)/g },
  {
    kind: 'npwp',
    pattern: new RegExp(String.raw`(?<=\bnpwp\W{0,5})\d{15,16}(?!\d)`, 'gi'),
  },
  {
    kind: 'nik',
    pattern: new RegExp(String.raw`(?<=\b${NIK_KEYWORD}\W{0,5})\d{16}(?!\d)`, 'gi'),
  },
  {
    kind: 'nik',
    pattern: /(?<!\d)\d{16}(?!\d)/g,
    accept: hasPlausibleNikStructure,
  },
  {
    kind: 'bank_account',
    pattern: new RegExp(
      String.raw`(?<=\b${BANK_KEYWORD}[^\d\n]{0,20})\d(?:[ -]?\d){7,15}(?!\d)`,
      'gi',
    ),
  },
  // Indonesian mobile numbers: +62 / 62 / 0 then 8, then 8 to 11 more digits.
  // Landlines are intentionally out of scope (see vectors README). The leading
  // lookbehind stops the tail of a longer digit run from matching.
  {
    kind: 'phone',
    pattern: /(?<![\d+])(?:\+62|62|0)[ .-]?8(?:[ .-]?\d){8,11}(?!\d)/g,
  },
];

/**
 * Finds personal identifiers and secrets. Spans never overlap: when two rules
 * match the same text the earlier rule in RULES wins. Result is sorted by
 * position. Never throws.
 */
export function detectPii(text: string): PiiMatch[] {
  const accepted: Array<PiiMatch & { priority: number }> = [];

  RULES.forEach((rule, priority) => {
    for (const found of text.matchAll(rule.pattern)) {
      const matched = found[0];
      if (matched.length === 0 || (rule.accept && !rule.accept(matched))) {
        continue;
      }
      const start = found.index;
      const end = start + matched.length;
      const overlaps = accepted.some(
        (other) => start < other.end && other.start < end,
      );
      // Rules run in priority order, so an overlap means a higher priority
      // rule already claimed this text.
      if (!overlaps) {
        accepted.push({ kind: rule.kind, start, end, priority, ...(rule.id ? { pattern_id: rule.id } : {}) });
      }
    }
  });

  return accepted
    .sort((a, b) => a.start - b.start)
    .map(({ kind, start, end, pattern_id }) => ({
      kind,
      start,
      end,
      ...(kind === 'secret' && pattern_id ? { pattern_id } : {}),
    }));
}
