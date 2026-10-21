// Pure helpers for the profile form, kept out of the component so the
// change-detection and option rules can be unit-tested without a DOM.

export interface ProfileDraft {
  full_name: string;
  locale: string;
  timezone: string;
}

export const FULL_NAME_MAX = 100;

export const LOCALE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'id', label: 'Bahasa Indonesia' },
] as const;

/** Fields that differ from the saved profile; the name is compared and sent trimmed. */
export function buildProfilePatch(saved: ProfileDraft, draft: ProfileDraft): Partial<ProfileDraft> {
  const patch: Partial<ProfileDraft> = {};
  const name = draft.full_name.trim();
  if (name !== saved.full_name) patch.full_name = name;
  if (draft.locale !== saved.locale) patch.locale = draft.locale;
  if (draft.timezone !== saved.timezone) patch.timezone = draft.timezone;
  return patch;
}

/** Mirrors the server rule (1-100 characters after trimming) so Save never sends a doomed request. */
export function isDraftSavable(saved: ProfileDraft, draft: ProfileDraft): boolean {
  const name = draft.full_name.trim();
  if (name.length < 1 || name.length > FULL_NAME_MAX) return false;
  return Object.keys(buildProfilePatch(saved, draft)).length > 0;
}

/**
 * Zones for the select. `Intl.supportedValuesOf` omits some valid names such
 * as 'UTC', so the saved zone is added back; otherwise the select would show
 * a different zone than the one stored.
 */
export function timeZoneOptions(current: string, supported: readonly string[]): string[] {
  return [...new Set([...supported, current])].sort((a, b) => a.localeCompare(b));
}
