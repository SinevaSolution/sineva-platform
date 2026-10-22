import { describe, expect, it } from 'vitest';
import {
  buildProfilePatch,
  isDraftSavable,
  LOCALE_OPTIONS,
  timeZoneOptions,
} from '@/client/components/settings/profile_form_model';

const saved = { full_name: 'Amira Putri', locale: 'id', timezone: 'Asia/Jakarta' };

describe('buildProfilePatch', () => {
  it('is empty when nothing changed', () => {
    expect(buildProfilePatch(saved, { ...saved })).toEqual({});
  });

  it('ignores whitespace-only differences in the name', () => {
    expect(buildProfilePatch(saved, { ...saved, full_name: '  Amira Putri ' })).toEqual({});
  });

  it('includes only changed fields, with the name trimmed', () => {
    expect(
      buildProfilePatch(saved, { ...saved, full_name: ' Amira Lestari ', locale: 'en' }),
    ).toEqual({ full_name: 'Amira Lestari', locale: 'en' });
  });

  it('includes a changed timezone', () => {
    expect(buildProfilePatch(saved, { ...saved, timezone: 'Asia/Makassar' })).toEqual({
      timezone: 'Asia/Makassar',
    });
  });
});

describe('isDraftSavable', () => {
  it('is false when nothing changed', () => {
    expect(isDraftSavable(saved, { ...saved })).toBe(false);
  });

  it('is true when a valid change exists', () => {
    expect(isDraftSavable(saved, { ...saved, locale: 'en' })).toBe(true);
  });

  it('is false when the name is blank or longer than 100 characters', () => {
    expect(isDraftSavable(saved, { ...saved, full_name: '   ' })).toBe(false);
    expect(isDraftSavable(saved, { ...saved, full_name: 'a'.repeat(101) })).toBe(false);
  });
});

describe('timeZoneOptions', () => {
  it('sorts and de-duplicates the supported zones', () => {
    expect(timeZoneOptions('Asia/Jakarta', ['Europe/Paris', 'Asia/Jakarta', 'Asia/Jakarta'])).toEqual([
      'Asia/Jakarta',
      'Europe/Paris',
    ]);
  });

  it('keeps the saved zone selectable even when the runtime does not list it', () => {
    expect(timeZoneOptions('UTC', ['Asia/Jakarta'])).toEqual(['Asia/Jakarta', 'UTC']);
  });
});

describe('LOCALE_OPTIONS', () => {
  it('offers every enabled locale from the registry by its native name', () => {
    expect(LOCALE_OPTIONS).toEqual([
      { value: 'id', label: 'Bahasa Indonesia' },
      { value: 'en', label: 'English' },
    ]);
  });
});
