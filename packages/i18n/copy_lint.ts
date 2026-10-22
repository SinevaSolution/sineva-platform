// Wording rules for every string a customer reads (FR-UX-37, Founder decisions
// D-02, D-03, D-09, D-10). Pure functions over strings and catalogs, so the
// vitest suite, a pre-commit hook and the ESLint rule can all share them.
//
// What this cannot see: model output and user content. Those never pass
// through a catalog, so the lint says nothing about them. Guardrails and
// prompts (sineva-ai) own that gap.

import { messageParams } from './format_message';
import { flattenMessages, type Messages } from './translator';

export interface CopyViolation {
  rule:
    | 'banned_word'
    | 'banned_phrase'
    | 'dash'
    | 'mention_comma'
    | 'internal_term'
    | 'technical_term'
    | 'voice'
    | 'emoji'
    | 'sinofinance_word'
    | 'empty'
    | 'missing_key'
    | 'extra_key'
    | 'param_mismatch'
    | 'protected_name'
    | 'required_term';
  locale: string;
  key: string;
  message: string;
}

/**
 * Names that stay in English in every locale (D-09). A catalog that drops or
 * translates one fails the pair lint. "Specialist" and "Connected tools" are
 * deliberately not here: they are translated ("Spesialis", "Aplikasi terhubung").
 */
export const DO_NOT_TRANSLATE = [
  'Sino',
  'Sino Library',
  'Room',
  'Squad',
  'Workflow',
  'Routine',
  'Skill',
  'Inbox',
  'SinoPeople',
  'SinoFinance',
  'SinoSales',
  'SinoSocial',
  'SinoHelp',
  'SinoInsights',
  'SinoDesk',
  'SinoWrite',
  'SinoShop',
  'SinoGuard',
  'SinoTax',
  'SinoLegal',
  'SinoOps',
] as const;

// Words are matched whole and case-insensitively, so "agenda", "robot" and
// "bottom" pass. Sino is a companion, never any of these (D-02).
const BANNED_EVERYWHERE = /\b(agents?|assistants?|chatbots?|bots?|credits?)\b/i;
const BANNED_INDONESIAN = /\b(asisten|pembantu|kredit|agen)\b/i;
const BANNED_PHRASES = /\b(submit|click here|klik di sini)\b/i;
const DASHES = /[‒-―]/;
const MENTION_COMMA = /@Sino[A-Za-z]*,/;
// Internal vocabulary a customer should never read (copywriting_and_brand).
const INTERNAL_TERMS = /\b(BFF|Docker|Prisma|upstream|orchestrator|tenant|502)\b/;
// Engineering words a customer should never have to learn (ADR-0033). Say what
// it means for them instead: "Sino is reading your file", "pages read from
// photos and scans". Matched as whole words in every locale, with the
// Indonesian counterparts alongside, so one rule covers both catalogs.
// RAG is case-sensitive because "rag" is an ordinary English word. There is
// no allowlist on purpose: a string that needs one of these words is a string
// to rephrase.
const TECHNICAL_TERMS = new RegExp(
  [
    String.raw`\b(?:ocr|embeddings?|chunks?|chunking|vectors?|index(?:es|ed|ing)?|ingest(?:s|ed|ing|ion)?|tokens?|payloads?|webhooks?|json|bff)\b`,
    // Indonesian: indeks, mengindeks, pengindeksan, terindeks, vektor, tokenisasi, penyematan (embedding).
    String.raw`\b(?:indeks|mengindeks|diindeks|terindeks|pengindeksan|vektor|tokenisasi|penyematan)\b`,
  ].join('|'),
  'i',
);
const TECHNICAL_ACRONYMS = /\bRAG\b/;
// Indonesian copy says "kamu" and Sino says "aku" (D-03).
const INDONESIAN_VOICE = /\b(anda|saya)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const FINANCE_WORDS = /\b(loans?|financing|cicilan|pinjaman|pembiayaan)\b/i;

export function lintCopyString(value: string, ctx: { locale: string; key: string }): CopyViolation[] {
  const found: CopyViolation[] = [];
  const add = (rule: CopyViolation['rule'], message: string) =>
    found.push({ rule, locale: ctx.locale, key: ctx.key, message });

  if (value.trim() === '') {
    add('empty', 'message is empty');
    return found;
  }
  const banned = BANNED_EVERYWHERE.exec(value) ?? (ctx.locale === 'id' ? BANNED_INDONESIAN.exec(value) : null);
  if (banned) add('banned_word', `"${banned[0]}" is banned in customer copy; Sino is a companion`);
  const phrase = BANNED_PHRASES.exec(value);
  if (phrase) add('banned_phrase', `"${phrase[0]}" is banned; name the action instead`);
  if (DASHES.test(value)) add('dash', 'no em or en dash; use a period, comma, colon or "to"');
  if (MENTION_COMMA.test(value)) add('mention_comma', 'write "@SinoHelp request" with no comma after the mention');
  const internal = INTERNAL_TERMS.exec(value);
  if (internal) add('internal_term', `"${internal[0]}" is internal vocabulary`);
  const technical = TECHNICAL_TERMS.exec(value) ?? TECHNICAL_ACRONYMS.exec(value);
  if (technical) add('technical_term', `"${technical[0]}" is a technical word; say what it means for the customer`);
  if (ctx.locale === 'id') {
    const voice = INDONESIAN_VOICE.exec(value);
    if (voice) add('voice', `"${voice[0]}": Indonesian copy uses "kamu" and Sino says "aku"`);
  }
  if (EMOJI.test(value)) add('emoji', 'no emoji in system copy');
  if ((/sinofinance/i.test(ctx.key) || /sinofinance/i.test(value)) && FINANCE_WORDS.test(value)) {
    add('sinofinance_word', 'loan and financing words are banned on SinoFinance surfaces');
  }
  return found;
}

/** Copy rules over every string of one locale's catalog, `mcp.*` included. */
export function lintCatalog(locale: string, messages: Messages): CopyViolation[] {
  return Object.entries(flattenMessages(messages)).flatMap(([key, value]) => lintCopyString(value, { locale, key }));
}

// Whole word with an optional plural "s", case-sensitive: "Room" is the
// product concept, "room" is a word.
function containsName(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z])${escaped}s?(?![A-Za-z])`).test(text);
}

function protectedNamesIn(text: string): string[] {
  const names = new Set<string>(DO_NOT_TRANSLATE.filter((name) => containsName(text, name)));
  for (const match of text.matchAll(/(?<![A-Za-z])Sino[A-Z][A-Za-z]*/g)) names.add(match[0]);
  return [...names];
}

// English concept in the reference text, Indonesian term that must carry it.
const REQUIRED_INDONESIAN: ReadonlyArray<{ en: RegExp; id: RegExp; label: string }> = [
  { en: /\bspecialists?\b/i, id: /\bspesialis\b/i, label: '"Specialist" is "Spesialis"' },
  { en: /\bconnected tools\b/i, id: /aplikasi terhubung/i, label: '"Connected tools" is "Aplikasi terhubung"' },
];

/**
 * Rules that compare locales, plus the single-locale rules for each. Keys
 * come from the reference catalog: a key the other locale lacks, has extra or
 * has with different `{params}` fails, and so does a protected name that was
 * translated away (it must appear wherever the reference has it).
 */
export function lintCatalogPair(catalogs: Record<string, Messages>, reference = 'en'): CopyViolation[] {
  const base = catalogs[reference];
  if (!base) throw new Error(`Reference catalog "${reference}" not provided`);
  const baseFlat = flattenMessages(base);
  const found: CopyViolation[] = [];

  for (const [locale, messages] of Object.entries(catalogs)) {
    found.push(...lintCatalog(locale, messages));
    if (locale === reference) continue;
    const flat = flattenMessages(messages);
    const add = (rule: CopyViolation['rule'], key: string, message: string) =>
      found.push({ rule, locale, key, message });

    for (const key of Object.keys(baseFlat)) {
      if (!(key in flat)) add('missing_key', key, `missing in "${locale}"`);
    }
    for (const key of Object.keys(flat)) {
      if (!(key in baseFlat)) add('extra_key', key, `exists in "${locale}" but not in "${reference}"`);
    }
    for (const [key, source] of Object.entries(baseFlat)) {
      const value = flat[key];
      if (value === undefined) continue;
      const want = messageParams(source).sort().join(',');
      const have = messageParams(value).sort().join(',');
      if (want !== have) add('param_mismatch', key, `params differ: {${want}} against {${have}}`);
      for (const name of protectedNamesIn(source)) {
        if (!containsName(value, name)) add('protected_name', key, `"${name}" must stay untranslated`);
      }
      if (locale === 'id') {
        for (const rule of REQUIRED_INDONESIAN) {
          if (rule.en.test(source) && !rule.id.test(value)) add('required_term', key, rule.label);
        }
      }
    }
  }
  return found;
}
