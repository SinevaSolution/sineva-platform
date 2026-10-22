import { describe, expect, it } from 'vitest';
import {
  buildCountries,
  flagEmoji,
  phoneFromText,
  phoneFromValue,
  phoneWithCountry,
  scoreCountry,
  snIsValidPhoneNumber,
  type PhoneCountry,
} from './phone_data';

const en = buildCountries('en');
const id = buildCountries('id');
const byIso = (list: PhoneCountry[], iso: string) => {
  const found = list.find((country) => country.iso === iso);
  if (!found) throw new Error(`no ${iso}`);
  return found;
};
const matches = (list: PhoneCountry[], search: string) =>
  list.filter((country) => scoreCountry(search, country) > 0).map((country) => country.iso);

describe('flagEmoji', () => {
  it('builds the flag from the regional indicator letters of the ISO code', () => {
    expect(flagEmoji('ID')).toBe('\u{1F1EE}\u{1F1E9}');
    expect(flagEmoji('us')).toBe('\u{1F1FA}\u{1F1F8}');
  });
});

describe('buildCountries', () => {
  it('pins Indonesia first, then the regional favourites, then everything else', () => {
    expect(en.slice(0, 5).map((country) => country.iso)).toEqual(['ID', 'MY', 'SG', 'AU', 'US']);
  });

  it('lists every other country once, alphabetically by the localized name', () => {
    const rest = en.slice(5);
    expect(new Set(en.map((country) => country.iso)).size).toBe(en.length);
    expect(rest.length).toBeGreaterThan(200);
    const names = rest.map((country) => country.name);
    expect(names).toEqual([...names].sort(new Intl.Collator('en').compare));
  });

  it('carries the dial code without a plus', () => {
    expect(byIso(en, 'ID').dial).toBe('62');
    expect(byIso(en, 'GB').dial).toBe('44');
    expect(byIso(en, 'US').dial).toBe('1');
  });

  it('names countries in the UI language and keeps the English name for search', () => {
    expect(byIso(en, 'DE').name).toBe('Germany');
    expect(byIso(id, 'DE').name).toBe('Jerman');
    expect(byIso(id, 'DE').englishName).toBe('Germany');
  });

  it('sorts the rest by the Indonesian names when the language is Indonesian', () => {
    const names = id.slice(5).map((country) => country.name);
    expect(names).toEqual([...names].sort(new Intl.Collator('id').compare));
  });

  it('honours another default and other favourites', () => {
    const list = buildCountries('en', { defaultCountry: 'MY', favourites: ['ID'] });
    expect(list.slice(0, 2).map((country) => country.iso)).toEqual(['MY', 'ID']);
  });
});

describe('scoreCountry', () => {
  it('finds a country by its localized name, ignoring case and accents', () => {
    expect(matches(en, 'indonesia')).toContain('ID');
    expect(matches(en, 'GERMA')).toContain('DE');
    expect(matches(en, 'cote')).toContain('CI');
  });

  it('finds by the English name while the list is in Indonesian', () => {
    expect(matches(id, 'jerman')).toContain('DE');
    expect(matches(id, 'germany')).toContain('DE');
  });

  it('finds by ISO code and ranks the exact code first', () => {
    const hits = en
      .map((country) => ({ iso: country.iso, score: scoreCountry('id', country) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score);
    expect(hits[0]?.iso).toBe('ID');
    expect(matches(en, 'US')).toContain('US');
  });

  it('finds by dial code with or without the plus', () => {
    expect(matches(en, '62')).toEqual(['ID']);
    expect(matches(en, '+62')).toEqual(['ID']);
    expect(matches(en, '+44')).toEqual(expect.arrayContaining(['GB', 'GG', 'JE', 'IM']));
    expect(matches(en, '+44')).not.toContain('ID');
  });

  it('treats a dial code as a prefix and ranks the exact code above longer ones', () => {
    expect(matches(en, '+6')).toEqual(expect.arrayContaining(['MY', 'AU', 'ID', 'PH', 'NZ', 'SG', 'TH']));
    // "2" is the exact code of nobody, a prefix of +20 (Egypt) and +212 (Morocco);
    // "20" is Egypt's exact code and ranks above Morocco's longer one.
    expect(scoreCountry('2', byIso(en, 'EG'))).toBeGreaterThan(0);
    expect(scoreCountry('20', byIso(en, 'EG'))).toBeGreaterThan(scoreCountry('2', byIso(en, 'EG')));
    expect(scoreCountry('20', byIso(en, 'MA'))).toBe(0);
    // Every +1 country shares the exact code, so they rank together.
    expect(scoreCountry('1', byIso(en, 'US'))).toBe(scoreCountry('1', byIso(en, 'JM')));
  });

  it('matches everything for an empty search and nothing for noise', () => {
    expect(matches(en, '')).toHaveLength(en.length);
    expect(matches(en, '+')).toHaveLength(en.length);
    expect(matches(en, 'zzzzqq')).toEqual([]);
  });

  it('requires every word of a multi-word search', () => {
    expect(matches(en, 'united kingdom')).toContain('GB');
    expect(matches(en, 'united kingdom')).not.toContain('US');
  });
});

describe('phoneFromText (typing into the national field)', () => {
  it('emits E.164 for a national number', () => {
    expect(phoneFromText('812 3456 7890', 'ID').value).toBe('+6281234567890');
    expect(phoneFromText('650 253 0000', 'US').value).toBe('+16502530000');
  });

  it('accepts and drops the leading 0 of the chosen country', () => {
    const draft = phoneFromText('0812 3456 7890', 'ID');
    expect(draft.value).toBe('+6281234567890');
    expect(draft.country).toBe('ID');
    expect(phoneFromText('0812', 'ID').value).toBe('+62812');
    expect(phoneFromText('07400 123456', 'GB').value).toBe('+447400123456');
  });

  it('formats as you type', () => {
    expect(phoneFromText('650253', 'US').text).toBe('(650) 253');
    expect(phoneFromText('08123456', 'ID').text).toBe('0812-3456');
  });

  it('leaves the text as typed when told not to reformat (caret inside the number)', () => {
    expect(phoneFromText('0812 34x56', 'ID', { reformat: false }).text).toBe('0812 3456');
    expect(phoneFromText('0812 3456', 'ID', { reformat: false }).value).toBe('+628123456');
  });

  it('is empty when there are no digits', () => {
    expect(phoneFromText('', 'ID')).toEqual({ country: 'ID', text: '', value: '' });
    expect(phoneFromText('abc', 'ID').value).toBe('');
  });

  it('keeps unfinished input invalid instead of dropping it', () => {
    const lone = phoneFromText('0', 'ID');
    expect(lone.value).not.toBe('');
    expect(snIsValidPhoneNumber(lone.value)).toBe(false);
  });

  it('caps the number at 15 digits including the country code', () => {
    expect(phoneFromText('8'.repeat(30), 'ID').value).toBe(`+62${'8'.repeat(13)}`);
  });

  it('switches country when a full international number is pasted', () => {
    const draft = phoneFromText('+44 7400 123456', 'ID');
    expect(draft.country).toBe('GB');
    expect(draft.value).toBe('+447400123456');
    expect(draft.text.replace(/\D/g, '')).toBe('07400123456');
  });

  it('reads the 00 international prefix like a plus', () => {
    const draft = phoneFromText('0044 7400 123456', 'ID');
    expect(draft.country).toBe('GB');
    expect(draft.value).toBe('+447400123456');
  });

  it('picks the country from the number itself when a code is shared', () => {
    expect(phoneFromText('+1 650 253 0000', 'ID').country).toBe('US');
    expect(phoneFromText('+1', 'ID').country).toBe('US');
    expect(phoneFromText('+7', 'ID').country).toBe('RU');
  });

  it('keeps the selected country when its code matches the pasted one', () => {
    expect(phoneFromText('+62 812 3456 7890', 'ID').country).toBe('ID');
  });

  it('turns a typed +62 into the country with an empty field', () => {
    expect(phoneFromText('+62', 'MY')).toEqual({ country: 'ID', text: '', value: '' });
  });

  it('waits while the country code is unfinished', () => {
    const draft = phoneFromText('+8', 'ID');
    expect(draft.country).toBe('ID');
    expect(draft.text).toBe('+8');
    expect(snIsValidPhoneNumber(draft.value)).toBe(false);
  });
});

describe('phoneWithCountry', () => {
  it('keeps the digits and re-reads them for the new country', () => {
    const draft = phoneWithCountry('0812 3456 7890', 'SG');
    expect(draft.country).toBe('SG');
    expect(draft.value.startsWith('+65')).toBe(true);
    expect(draft.value.replace(/\D/g, '')).toContain('81234567890');
  });

  it('stays empty with no digits', () => {
    expect(phoneWithCountry('', 'SG')).toEqual({ country: 'SG', text: '', value: '' });
  });
});

describe('phoneFromValue (E.164 in)', () => {
  it('shows an Indonesian number nationally with its leading 0', () => {
    const draft = phoneFromValue('+6281234567890', 'MY');
    expect(draft.country).toBe('ID');
    expect(draft.text).toBe('0812-3456-7890');
    expect(draft.value).toBe('+6281234567890');
  });

  it('finds the country of a foreign number', () => {
    expect(phoneFromValue('+14155552671', 'ID').country).toBe('US');
    expect(phoneFromValue('+447400123456', 'ID').country).toBe('GB');
  });

  it('keeps the fallback country for an empty value', () => {
    expect(phoneFromValue('', 'SG')).toEqual({ country: 'SG', text: '', value: '' });
  });

  it('does not throw on a stored value that is not a number', () => {
    const draft = phoneFromValue('call me', 'ID');
    expect(draft.country).toBe('ID');
    expect(typeof draft.text).toBe('string');
  });
});

describe('snIsValidPhoneNumber', () => {
  it('accepts real numbers of several countries', () => {
    for (const value of ['+6281234567890', '+14155552671', '+447400123456', '+6591234567']) {
      expect(snIsValidPhoneNumber(value), value).toBe(true);
    }
  });

  it('rejects numbers that are only shaped like E.164', () => {
    for (const value of ['', '+62', '+62812', '+6212345', '+628123456789012', '0812', 'abc']) {
      expect(snIsValidPhoneNumber(value), value).toBe(false);
    }
  });
});
