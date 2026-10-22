// Country data and number handling behind SNPhoneInput. Pure (no React, no DOM)
// so the rules can be tested without rendering anything.
//
// Why libphonenumber-js/min and not /max: the min metadata is about 60 KB
// smaller (gzipped) and keeps what this field needs, which is calling codes,
// national prefixes, as-you-type formatting and a per-country number pattern.
// What it drops is the per-line-type patterns (mobile against fixed line), so
// "valid" here means "a number that can exist in that country", not "a mobile".
// A profile phone does not need more, and the server re-checks the E.164 shape.
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';

export type { CountryCode };

export interface PhoneCountry {
  /** ISO 3166-1 alpha-2, upper case. */
  iso: CountryCode;
  /** Calling code without the plus ("62"). */
  dial: string;
  /** Name in the UI language. */
  name: string;
  /** English name, kept so people can search in English from an Indonesian UI. */
  englishName: string;
  flag: string;
}

/** What the component keeps between renders: the picked country, the text in the box and the E.164 it stands for. */
export interface PhoneDraft {
  country: CountryCode;
  text: string;
  /** E.164, an unfinished E.164-shaped string while the number is incomplete, or '' when empty. */
  value: string;
}

export const DEFAULT_COUNTRY: CountryCode = 'ID';
export const FAVOURITE_COUNTRIES: readonly CountryCode[] = ['MY', 'SG', 'AU', 'US'];

// E.164 allows 15 digits in total, calling code included.
const MAX_DIGITS = 15;

// A calling code shared by several countries needs a default for a pasted
// number that is too short to tell them apart ("+1" alone, "+44 7"). The
// country with the most users of the code goes first. Any code not listed
// belongs to one country, or the first one the library returns is as good.
const MAIN_COUNTRY: Record<string, CountryCode> = {
  '1': 'US',
  '7': 'RU',
  '39': 'IT',
  '44': 'GB',
  '47': 'NO',
  '61': 'AU',
  '212': 'MA',
  '262': 'RE',
  '290': 'SH',
  '358': 'FI',
  '590': 'GP',
  '599': 'CW',
};

const digitsOf = (text: string) => text.replace(/\D/g, '');

// The national (significant) number the reader has so far, without the trunk
// prefix. Documented in the library README and present at runtime, but missing
// from its shipped type definitions, hence the cast. The typed alternative,
// getNumber()?.nationalNumber, is undefined for a number too short to parse,
// which would drop digits the person has typed.
const nationalNumberOf = (reader: AsYouType): string =>
  (reader as AsYouType & { getNationalNumber(): string }).getNationalNumber();

/**
 * Flag from the ISO code: each letter becomes the matching regional indicator
 * symbol and the pair renders as a flag. No image assets, no network. Windows
 * does not ship flag glyphs and shows the two letters instead, which still
 * reads as the country code, so the button never looks broken.
 */
export function flagEmoji(iso: string): string {
  return [...iso.toUpperCase()].map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)).join('');
}

function regionNames(locale: string): Intl.DisplayNames {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    // A malformed tag throws RangeError; English beats a broken list.
    return new Intl.DisplayNames(['en'], { type: 'region' });
  }
}

export interface BuildCountriesOptions {
  defaultCountry?: CountryCode;
  favourites?: readonly CountryCode[];
}

/**
 * The list in display order: the default country pinned first, the favourites
 * next, then every other country alphabetically by its name in `locale`. A
 * country is listed once, so the list has one row per ISO code.
 */
export function buildCountries(locale: string, options: BuildCountriesOptions = {}): PhoneCountry[] {
  const { defaultCountry = DEFAULT_COUNTRY, favourites = FAVOURITE_COUNTRIES } = options;
  const localized = regionNames(locale);
  const english = regionNames('en');
  const all: PhoneCountry[] = getCountries().map((iso) => ({
    iso,
    dial: getCountryCallingCode(iso),
    name: localized.of(iso) ?? iso,
    englishName: english.of(iso) ?? iso,
    flag: flagEmoji(iso),
  }));
  const byIso = new Map(all.map((country) => [country.iso, country]));
  const pinned = [defaultCountry, ...favourites]
    .filter((iso, index, list) => list.indexOf(iso) === index)
    .flatMap((iso) => byIso.get(iso) ?? []);
  const pinnedIso = new Set(pinned.map((country) => country.iso));
  const collator = new Intl.Collator(locale);
  const rest = all.filter((country) => !pinnedIso.has(country.iso)).sort((a, b) => collator.compare(a.name, b.name));
  return [...pinned, ...rest];
}

// Lower case, accents dropped, punctuation read as a space: "cote d'ivoire"
// finds "Côte d’Ivoire" and "curacao" finds "Curaçao".
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Search score for one country: 0 hides it, higher ranks it higher.
 *
 * - Digits, with or without "+": a dial-code prefix ("6" lists every +6x,
 *   "62" only Indonesia); the exact code ranks above longer ones.
 * - Letters: the ISO code ("ID") ranks first; otherwise every word must appear
 *   in the localized or the English name, and a name that starts with the
 *   search ranks above one that only contains it.
 *
 * Not cmdk's default scorer: it is a fuzzy subsequence match, which makes
 * "id" match half the list.
 */
export function scoreCountry(search: string, country: Pick<PhoneCountry, 'iso' | 'dial' | 'name' | 'englishName'>): number {
  const raw = search.trim();
  if (raw === '' || raw === '+') return 1;
  if (/^\+?\d+$/.test(raw)) {
    const code = raw.replace('+', '');
    if (country.dial === code) return 3;
    return country.dial.startsWith(code) ? 2 : 0;
  }
  const query = fold(raw);
  if (query === '') return 1;
  if (query === country.iso.toLowerCase()) return 3;
  const name = fold(country.name);
  const englishName = fold(country.englishName);
  const haystack = `${name} ${englishName}`;
  if (!query.split(' ').every((word) => haystack.includes(word))) return 0;
  return name.startsWith(query) || englishName.startsWith(query) ? 2 : 1;
}

function mainCountry(callingCode: string, preferred: CountryCode): CountryCode {
  if (getCountryCallingCode(preferred) === callingCode) return preferred;
  return MAIN_COUNTRY[callingCode] ?? getCountries().find((iso) => getCountryCallingCode(iso) === callingCode) ?? preferred;
}

/**
 * The number as a person in that country writes it. A complete number gets the
 * library's national format (which carries the trunk 0: "0812-3456-7890"); a
 * partial one is formatted as typed, since the library can only format whole
 * numbers.
 */
function displayNational(country: CountryCode, e164: string, nationalNumber: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (parsed?.isValid() && parsed.country === country) return parsed.formatNational();
  return new AsYouType(country).input(nationalNumber);
}

function fromNational(country: CountryCode, typedDigits: string, formatText: boolean, rawText: string): PhoneDraft {
  if (typedDigits === '') return { country, text: '', value: '' };
  const dial = getCountryCallingCode(country);
  const room = MAX_DIGITS - dial.length;
  let digits = typedDigits;
  let reader = new AsYouType(country);
  let formatted = reader.input(digits);
  // The cap counts the national number, not what was typed: the trunk 0 of
  // "0812..." is not part of E.164 and must not eat a digit.
  const overflow = nationalNumberOf(reader).length - room;
  if (overflow > 0) {
    digits = digits.slice(0, digits.length - overflow);
    reader = new AsYouType(country);
    formatted = reader.input(digits);
  }
  const text = formatText ? formatted : rawText.replace(/[^\d\s\-().]/g, '');
  // AsYouType strips the national prefix by the country's own rules (0 for
  // Indonesia and the UK, none for the US). parsePhoneNumber would not: it only
  // strips it once the number is complete, so "0812" would become +620812.
  // With no digits left after the prefix (just "0") the value stays "+62",
  // which is invalid on purpose: unfinished input must block Save, not vanish.
  return { country, text, value: `+${dial}${nationalNumberOf(reader)}` };
}

function fromInternational(raw: string, current: CountryCode): PhoneDraft {
  const digits = digitsOf(raw).slice(0, MAX_DIGITS);
  if (digits === '') return { country: current, text: '+', value: '+' };
  const reader = new AsYouType();
  reader.input(`+${digits}`);
  const callingCode = reader.getCallingCode();
  // "+8" could still become +81 or +852: keep what was typed and wait.
  if (!callingCode) return { country: current, text: `+${digits}`, value: `+${digits}` };
  // The digits after the code decide between countries that share it (+1 415
  // is the US, +1 204 is Canada); a bare "+1" falls back to the main one.
  const country = reader.getCountry() ?? mainCountry(callingCode, current);
  const nationalNumber = nationalNumberOf(reader).slice(0, MAX_DIGITS - callingCode.length);
  if (nationalNumber === '') return { country, text: '', value: '' };
  const e164 = `+${callingCode}${nationalNumber}`;
  return { country, text: displayNational(country, e164, nationalNumber), value: e164 };
}

/**
 * The person typed or pasted into the number box. A leading "+" (or "00") means
 * a full international number: the country follows it. Anything else is a
 * national number of `country`, and a leading trunk 0 is accepted.
 *
 * `reformat: false` keeps the text as typed (only junk characters go). It is
 * for edits in the middle of the number, where rewriting the text would throw
 * the caret to the end.
 */
export function phoneFromText(raw: string, country: CountryCode, options: { reformat?: boolean } = {}): PhoneDraft {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return fromInternational(trimmed, country);
  const digits = digitsOf(trimmed);
  if (digits.startsWith('00')) return fromInternational(`+${digits.slice(2)}`, country);
  return fromNational(country, digits, options.reformat ?? true, raw);
}

/** A country was picked: keep the digits and read them for the new country. */
export function phoneWithCountry(text: string, country: CountryCode): PhoneDraft {
  return fromNational(country, digitsOf(text), true, text);
}

/**
 * A value arrives from outside (the saved profile, a discard). E.164 gives the
 * country; an empty value keeps `fallback`. A stored value that is not a number
 * is shown as it is rather than hidden, so it can be corrected.
 */
export function phoneFromValue(value: string, fallback: CountryCode): PhoneDraft {
  if (!value) return { country: fallback, text: '', value: '' };
  const parsed = parsePhoneNumberFromString(value, fallback);
  if (!parsed) return { country: fallback, text: value, value };
  const country = parsed.country ?? mainCountry(parsed.countryCallingCode, fallback);
  return { country, text: displayNational(country, parsed.number, parsed.nationalNumber), value };
}

/**
 * True for a complete number that exists in its country. E.164 only: a number
 * without "+" is never accepted, since guessing its country is how a wrong
 * number gets saved silently.
 */
export function snIsValidPhoneNumber(value: string): boolean {
  return value.startsWith('+') && isValidPhoneNumber(value);
}
