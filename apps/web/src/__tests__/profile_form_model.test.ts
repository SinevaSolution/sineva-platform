import { describe, expect, it } from 'vitest';
import {
  buildProfilePatch,
  greetingName,
  hasChanges,
  initialsOf,
  isDraftSavable,
  LOCALE_OPTIONS,
  timeZoneOptions,
  toDraft,
  validateDraft,
  type ProfileDraft,
} from '@/client/components/settings/profile_form_model';
import type { ProfileView } from '@/shared/profile_view';

const profile: ProfileView = {
  id: 'usr-1',
  email: 'amira@example.com',
  email_verified: true,
  full_name: 'Amira Putri',
  preferred_name: null,
  salutation: null,
  phone_number: null,
  phone_verified: false,
  about_me: null,
  use_profile_in_context: true,
  avatar_url: null,
  locale: 'id',
  timezone: 'Asia/Jakarta',
  created_at: '2026-10-01T00:00:00.000Z',
};

const saved: ProfileDraft = toDraft(profile, { job_title: null, department: null });

describe('toDraft', () => {
  it('turns nulls into empty strings so inputs stay controlled', () => {
    expect(saved).toEqual({
      full_name: 'Amira Putri',
      preferred_name: '',
      salutation: '',
      phone_number: '',
      about_me: '',
      use_profile_in_context: true,
      locale: 'id',
      timezone: 'Asia/Jakarta',
      job_title: '',
      department: '',
    });
  });

  it('has no member fields when the workspace row is unknown', () => {
    expect(toDraft(profile, null).job_title).toBe('');
  });
});

describe('buildProfilePatch', () => {
  it('is empty when nothing changed', () => {
    const patch = buildProfilePatch(saved, { ...saved });
    expect(patch).toEqual({ profile: {}, member: {} });
    expect(hasChanges(patch)).toBe(false);
  });

  it('ignores whitespace-only differences', () => {
    expect(buildProfilePatch(saved, { ...saved, full_name: '  Amira Putri ' }).profile).toEqual({});
  });

  it('sends only changed fields, trimmed', () => {
    const patch = buildProfilePatch(saved, { ...saved, full_name: ' Amira Lestari ', locale: 'en' });
    expect(patch.profile).toEqual({ full_name: 'Amira Lestari', locale: 'en' });
  });

  it('sends null to clear an optional field that had a value', () => {
    const withNick = { ...saved, preferred_name: 'Mira', salutation: 'bu' as const };
    const patch = buildProfilePatch(withNick, { ...withNick, preferred_name: '  ', salutation: '' });
    expect(patch.profile).toEqual({ preferred_name: null, salutation: null });
  });

  it('does not send null for an optional field that was already empty', () => {
    expect(buildProfilePatch(saved, { ...saved, about_me: '   ' }).profile).toEqual({});
  });

  it('puts job title and department in the member patch, not the profile patch', () => {
    const patch = buildProfilePatch(saved, { ...saved, job_title: ' CFO ', department: 'finance' });
    expect(patch.profile).toEqual({});
    expect(patch.member).toEqual({ job_title: 'CFO', department: 'finance' });
    expect(hasChanges(patch)).toBe(true);
  });

  it('sends the context flag when toggled', () => {
    expect(buildProfilePatch(saved, { ...saved, use_profile_in_context: false }).profile).toEqual({
      use_profile_in_context: false,
    });
  });
});

describe('validateDraft (mirrors the server rules)', () => {
  it('passes the saved profile', () => {
    expect(validateDraft(saved)).toEqual({});
  });

  it('flags a name that is too short, too long, or has digits or markup', () => {
    expect(validateDraft({ ...saved, full_name: 'A' }).full_name).toBe('name_length');
    expect(validateDraft({ ...saved, full_name: 'a'.repeat(101) }).full_name).toBe('name_length');
    expect(validateDraft({ ...saved, full_name: 'Amira 2' }).full_name).toBe('name_chars');
    expect(validateDraft({ ...saved, full_name: '<b>Amira</b>' }).full_name).toBe('name_chars');
  });

  it('flags a preferred name over 40 characters', () => {
    expect(validateDraft({ ...saved, preferred_name: 'a'.repeat(41) }).preferred_name).toBe('preferred_name_length');
    expect(validateDraft({ ...saved, preferred_name: 'a'.repeat(40) }).preferred_name).toBeUndefined();
  });

  it('accepts Indonesian phone formats and flags the rest', () => {
    expect(validateDraft({ ...saved, phone_number: '0812-3456-7890' }).phone_number).toBeUndefined();
    expect(validateDraft({ ...saved, phone_number: '+6281234567890' }).phone_number).toBeUndefined();
    expect(validateDraft({ ...saved, phone_number: '12345' }).phone_number).toBe('phone_invalid');
    expect(validateDraft({ ...saved, phone_number: '' }).phone_number).toBeUndefined();
  });

  it('counts about_me in characters, 280 at most', () => {
    expect(validateDraft({ ...saved, about_me: '😀'.repeat(280) }).about_me).toBeUndefined();
    expect(validateDraft({ ...saved, about_me: 'a'.repeat(281) }).about_me).toBe('about_me_length');
  });

  it('flags a job title over 60 characters', () => {
    expect(validateDraft({ ...saved, job_title: 'a'.repeat(61) }).job_title).toBe('job_title_length');
  });
});

describe('isDraftSavable', () => {
  it('is false when nothing changed', () => {
    expect(isDraftSavable(saved, { ...saved })).toBe(false);
  });

  it('is true when a valid change exists', () => {
    expect(isDraftSavable(saved, { ...saved, locale: 'en' })).toBe(true);
  });

  it('is false when a change is invalid', () => {
    expect(isDraftSavable(saved, { ...saved, full_name: 'A' })).toBe(false);
    expect(isDraftSavable(saved, { ...saved, phone_number: 'abc' })).toBe(false);
  });
});

describe('greetingName (the preview line under the avatar)', () => {
  it('is the salutation plus the preferred name', () => {
    expect(greetingName({ salutation: 'kak', preferred_name: 'Faishal', full_name: 'Muhammad Faishal' })).toBe('Kak Faishal');
  });

  it('falls back to the first word of the full name', () => {
    expect(greetingName({ salutation: 'bu', preferred_name: '', full_name: 'Amira Putri' })).toBe('Bu Amira');
  });

  it('omits the salutation when none or unset', () => {
    expect(greetingName({ salutation: 'none', preferred_name: '', full_name: 'Amira Putri' })).toBe('Amira');
    expect(greetingName({ salutation: '', preferred_name: 'Mira', full_name: 'Amira Putri' })).toBe('Mira');
  });
});

describe('initialsOf', () => {
  it('uses the first letters of the first two words, else the email', () => {
    expect(initialsOf('Amira Putri Lestari', 'a@x.id')).toBe('AP');
    expect(initialsOf('Amira', 'a@x.id')).toBe('A');
    expect(initialsOf('  ', 'budi@x.id')).toBe('B');
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
