import { LOCALES } from '@sineva/i18n';
import {
  ABOUT_ME_MAX,
  charCount,
  DEPARTMENTS,
  FULL_NAME_MAX,
  FULL_NAME_MIN,
  JOB_TITLE_MAX,
  NAME_CHARS,
  normalizePhoneNumber,
  PREFERRED_NAME_MAX,
  SALUTATIONS,
} from '@/shared/profile_options';
import type { DepartmentView, MemberProfileView, ProfileView, SalutationView } from '@/shared/profile_view';

// Pure helpers for the profile form, kept out of the component so the
// change-detection, validation and preview rules can be unit-tested without a
// DOM. Validation mirrors the server (`UpdateProfileSchema`) from the shared
// rules, so Save never sends a request the server will certainly refuse; the
// server stays the authority.

export { ABOUT_ME_MAX, DEPARTMENTS, FULL_NAME_MAX, JOB_TITLE_MAX, PREFERRED_NAME_MAX, SALUTATIONS };

/** Empty string stands for "not set" so every input stays controlled. */
export interface ProfileDraft {
  full_name: string;
  preferred_name: string;
  salutation: SalutationView | '';
  phone_number: string;
  about_me: string;
  use_profile_in_context: boolean;
  locale: string;
  timezone: string;
  job_title: string;
  department: DepartmentView | '';
}

export interface ProfilePatch {
  full_name?: string;
  preferred_name?: string | null;
  salutation?: SalutationView | null;
  phone_number?: string | null;
  about_me?: string | null;
  use_profile_in_context?: boolean;
  locale?: string;
  timezone?: string;
}

export interface MemberPatch {
  job_title?: string | null;
  department?: DepartmentView | null;
}

export interface DraftPatch {
  profile: ProfilePatch;
  member: MemberPatch;
}

export type DraftErrorKey =
  | 'name_length'
  | 'name_chars'
  | 'preferred_name_length'
  | 'phone_invalid'
  | 'about_me_length'
  | 'job_title_length';

export type DraftErrors = Partial<Record<keyof ProfileDraft, DraftErrorKey>>;

// From the locale registry, so a newly enabled language shows up here without
// touching the form. Labels are native names and are never translated.
export const LOCALE_OPTIONS = LOCALES.filter((l) => l.enabled).map((l) => ({
  value: l.code as string,
  label: l.native_name as string,
}));

export function toDraft(profile: ProfileView, member: MemberProfileView | null): ProfileDraft {
  return {
    full_name: profile.full_name,
    preferred_name: profile.preferred_name ?? '',
    salutation: profile.salutation ?? '',
    phone_number: profile.phone_number ?? '',
    about_me: profile.about_me ?? '',
    use_profile_in_context: profile.use_profile_in_context,
    locale: profile.locale,
    timezone: profile.timezone,
    job_title: member?.job_title ?? '',
    department: member?.department ?? '',
  };
}

/**
 * Fields that differ from the saved draft, split by the endpoint that owns
 * them. Text is compared and sent trimmed; an optional field that had a value
 * and is now blank becomes `null` (clear), one that was already blank is left
 * out.
 */
export function buildProfilePatch(saved: ProfileDraft, draft: ProfileDraft): DraftPatch {
  const profile: ProfilePatch = {};
  const member: MemberPatch = {};

  const name = draft.full_name.trim();
  if (name !== saved.full_name.trim()) profile.full_name = name;
  if (draft.locale !== saved.locale) profile.locale = draft.locale;
  if (draft.timezone !== saved.timezone) profile.timezone = draft.timezone;
  if (draft.use_profile_in_context !== saved.use_profile_in_context) {
    profile.use_profile_in_context = draft.use_profile_in_context;
  }

  const preferred = draft.preferred_name.trim();
  if (preferred !== saved.preferred_name.trim()) profile.preferred_name = preferred || null;
  if (draft.salutation !== saved.salutation) profile.salutation = draft.salutation || null;
  const phone = draft.phone_number.trim();
  if (phone !== saved.phone_number.trim()) profile.phone_number = phone || null;
  const about = draft.about_me.trim();
  if (about !== saved.about_me.trim()) profile.about_me = about || null;

  const title = draft.job_title.trim();
  if (title !== saved.job_title.trim()) member.job_title = title || null;
  if (draft.department !== saved.department) member.department = draft.department || null;

  return { profile, member };
}

export function hasChanges(patch: DraftPatch): boolean {
  return Object.keys(patch.profile).length > 0 || Object.keys(patch.member).length > 0;
}

export function validateDraft(draft: ProfileDraft): DraftErrors {
  const errors: DraftErrors = {};

  const name = draft.full_name.trim();
  if (charCount(name) < FULL_NAME_MIN || charCount(name) > FULL_NAME_MAX) {
    errors.full_name = 'name_length';
  } else if (!NAME_CHARS.test(name) || !/\p{L}/u.test(name)) {
    errors.full_name = 'name_chars';
  }

  if (charCount(draft.preferred_name.trim()) > PREFERRED_NAME_MAX) {
    errors.preferred_name = 'preferred_name_length';
  }
  const phone = draft.phone_number.trim();
  if (phone !== '' && normalizePhoneNumber(phone) === null) {
    errors.phone_number = 'phone_invalid';
  }
  if (charCount(draft.about_me.trim()) > ABOUT_ME_MAX) {
    errors.about_me = 'about_me_length';
  }
  if (charCount(draft.job_title.trim()) > JOB_TITLE_MAX) {
    errors.job_title = 'job_title_length';
  }
  return errors;
}

export function isDraftSavable(saved: ProfileDraft, draft: ProfileDraft): boolean {
  return Object.keys(validateDraft(draft)).length === 0 && hasChanges(buildProfilePatch(saved, draft));
}

export const SALUTATION_WORDS: Record<Exclude<SalutationView, 'none'>, string> = {
  pak: 'Pak',
  bu: 'Bu',
  kak: 'Kak',
  mas: 'Mas',
  mbak: 'Mbak',
};

/**
 * "Kak Faishal": how the companion will address the person. The salutation
 * words are Indonesian forms of address and stay as they are in both
 * languages, like product names.
 */
export function greetingName(input: {
  salutation: SalutationView | '' | null;
  preferred_name: string | null;
  full_name: string;
}): string {
  const first = input.full_name.trim().split(/\s+/)[0] ?? '';
  const name = input.preferred_name?.trim() || first;
  const title = input.salutation && input.salutation !== 'none' ? SALUTATION_WORDS[input.salutation] : '';
  return [title, name].filter(Boolean).join(' ');
}

export function initialsOf(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return email.charAt(0).toUpperCase();
  return ((parts[0][0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * Zones for the select. `Intl.supportedValuesOf` omits some valid names such
 * as 'UTC', so the saved zone is added back; otherwise the select would show
 * a different zone than the one stored.
 */
export function timeZoneOptions(current: string, supported: readonly string[]): string[] {
  return [...new Set([...supported, current])].sort((a, b) => a.localeCompare(b));
}
