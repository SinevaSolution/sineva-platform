import { describe, expect, it } from 'vitest';
import {
  DEPARTMENTS,
  MemberProfileUpdateSchema,
  normalizePhoneNumber,
  SALUTATIONS,
  UpdateProfileSchema,
} from '@/server/application/dtos/profile_dto';
import { UpdatePreferencesSchema } from '@/server/application/dtos/preferences_dto';

const ok = (body: unknown) => UpdateProfileSchema.safeParse(body).success;

describe('UpdateProfileSchema: full_name (FR-AUTH-07b)', () => {
  it('accepts 2 to 100 characters of letters, spaces, apostrophe, period and hyphen', () => {
    expect(ok({ full_name: 'Al' })).toBe(true);
    expect(ok({ full_name: "Siti Nur-Aini O'Brien Jr." })).toBe(true);
    expect(ok({ full_name: 'Zoë Müller' })).toBe(true);
    expect(ok({ full_name: 'a'.repeat(100) })).toBe(true);
  });

  it('rejects one character, 101 characters, digits and markup', () => {
    expect(ok({ full_name: 'A' })).toBe(false);
    expect(ok({ full_name: 'a'.repeat(101) })).toBe(false);
    expect(ok({ full_name: 'Amira 2' })).toBe(false);
    expect(ok({ full_name: '<b>Amira</b>' })).toBe(false);
    expect(ok({ full_name: '  ' })).toBe(false);
  });
});

describe('UpdateProfileSchema: optional attributes', () => {
  it('preferred_name is 1 to 40 characters and can be cleared with null', () => {
    expect(UpdateProfileSchema.parse({ preferred_name: ' Mira ' })).toEqual({ preferred_name: 'Mira' });
    expect(ok({ preferred_name: 'a'.repeat(40) })).toBe(true);
    expect(ok({ preferred_name: 'a'.repeat(41) })).toBe(false);
    expect(ok({ preferred_name: '' })).toBe(false);
    expect(UpdateProfileSchema.parse({ preferred_name: null })).toEqual({ preferred_name: null });
  });

  it('salutation is one of the fixed list (OQ-AUTH-10)', () => {
    expect([...SALUTATIONS]).toEqual(['none', 'pak', 'bu', 'kak', 'mas', 'mbak']);
    for (const salutation of SALUTATIONS) expect(ok({ salutation })).toBe(true);
    expect(ok({ salutation: 'dr' })).toBe(false);
    expect(UpdateProfileSchema.parse({ salutation: null })).toEqual({ salutation: null });
  });

  it('about_me is at most 280 characters, counted as characters not UTF-16 units', () => {
    expect(ok({ about_me: 'a'.repeat(280) })).toBe(true);
    expect(ok({ about_me: 'a'.repeat(281) })).toBe(false);
    expect(ok({ about_me: '😀'.repeat(280) })).toBe(true);
    expect(ok({ about_me: '😀'.repeat(281) })).toBe(false);
  });

  it('use_profile_in_context must be a boolean', () => {
    expect(ok({ use_profile_in_context: false })).toBe(true);
    expect(ok({ use_profile_in_context: 'yes' })).toBe(false);
  });

  it('locale follows the registry, timezone is IANA', () => {
    expect(ok({ locale: 'id' })).toBe(true);
    expect(ok({ locale: 'fr' })).toBe(false);
    expect(ok({ timezone: 'Asia/Makassar' })).toBe(true);
    expect(ok({ timezone: 'Mars/Phobos' })).toBe(false);
  });
});

describe('phone_number normalisation to E.164', () => {
  it.each([
    ['081234567890', '+6281234567890'],
    ['0812-3456-7890', '+6281234567890'],
    ['+62 812 3456 7890', '+6281234567890'],
    ['6281234567890', '+6281234567890'],
    ['006281234567890', '+6281234567890'],
    ['+14155552671', '+14155552671'],
    ['(0812) 3456.7890', '+6281234567890'],
  ])('%s becomes %s', (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
    expect(UpdateProfileSchema.parse({ phone_number: input })).toEqual({ phone_number: expected });
  });

  it.each(['', '123', 'abc', '+0123456789', '+1234567890123456', '0812abc4567', '+62'])(
    'rejects %s',
    (input) => {
      expect(normalizePhoneNumber(input)).toBeNull();
      expect(ok({ phone_number: input })).toBe(false);
    },
  );

  it('null clears the number', () => {
    expect(UpdateProfileSchema.parse({ phone_number: null })).toEqual({ phone_number: null });
  });
});

describe('read-only and identity fields are rejected (FR-AUTH-07c)', () => {
  it.each([
    'email',
    'email_verified',
    'email_verified_at',
    'phone_verified_at',
    'status',
    'two_factor_enabled',
    'id',
    'user_id',
    'avatar_url',
    'created_at',
  ])('%s fails with a validation error', (field) => {
    expect(ok({ full_name: 'Amira', [field]: 'x' })).toBe(false);
  });

  it('never accepts date of birth, gender, NIK, address or NPWP', () => {
    for (const field of ['date_of_birth', 'gender', 'nik', 'home_address', 'npwp']) {
      expect(ok({ full_name: 'Amira', [field]: 'x' })).toBe(false);
    }
  });

  it('rejects an empty body', () => {
    expect(ok({})).toBe(false);
  });
});

describe('MemberProfileUpdateSchema', () => {
  it('job_title is at most 60 characters and nullable', () => {
    expect(MemberProfileUpdateSchema.safeParse({ job_title: 'a'.repeat(60) }).success).toBe(true);
    expect(MemberProfileUpdateSchema.safeParse({ job_title: 'a'.repeat(61) }).success).toBe(false);
    expect(MemberProfileUpdateSchema.parse({ job_title: null })).toEqual({ job_title: null });
  });

  it('department is from the fixed list', () => {
    for (const department of DEPARTMENTS) {
      expect(MemberProfileUpdateSchema.safeParse({ department }).success).toBe(true);
    }
    expect(MemberProfileUpdateSchema.safeParse({ department: 'wizardry' }).success).toBe(false);
  });

  it('rejects role, user and workspace fields and an empty body', () => {
    expect(MemberProfileUpdateSchema.safeParse({ job_title: 'CEO', role: 'owner' }).success).toBe(false);
    expect(MemberProfileUpdateSchema.safeParse({ job_title: 'CEO', user_id: 'x' }).success).toBe(false);
    expect(MemberProfileUpdateSchema.safeParse({ job_title: 'CEO', workspace_id: 'x' }).success).toBe(false);
    expect(MemberProfileUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe('UpdatePreferencesSchema', () => {
  it('accepts every documented field', () => {
    expect(
      UpdatePreferencesSchema.safeParse({
        theme: 'dark',
        density: 'compact',
        focus_mode: true,
        reduce_motion: true,
        sidebar_collapsed: true,
        pause_character: true,
        room_view: true,
      }).success,
    ).toBe(true);
  });

  it('validates the enums and booleans', () => {
    expect(UpdatePreferencesSchema.safeParse({ theme: 'sepia' }).success).toBe(false);
    expect(UpdatePreferencesSchema.safeParse({ density: 'tiny' }).success).toBe(false);
    expect(UpdatePreferencesSchema.safeParse({ focus_mode: 'on' }).success).toBe(false);
  });

  it('rejects unknown keys, identity and an empty body', () => {
    expect(UpdatePreferencesSchema.safeParse({ theme: 'dark', user_id: 'x' }).success).toBe(false);
    expect(UpdatePreferencesSchema.safeParse({}).success).toBe(false);
  });
});
