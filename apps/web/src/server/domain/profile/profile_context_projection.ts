import type { SalutationValue, UserProfileEntity } from '@/server/domain/entities/user_profile';

/**
 * The only profile data allowed to reach the model. It is an allowlist built
 * field by field, never a spread of the profile: a column added to the profile
 * later stays out until someone decides it belongs here. Email, phone number
 * and avatar are personal contact data the model never needs.
 */
export interface ProfileContextProjection {
  /** The name the companion should use: preferred name, else full name. */
  display_name: string;
  salutation: SalutationValue | null;
  locale: string;
  timezone: string;
  about_me: string | null;
}

/** Null when the person turned "use my profile as context" off. */
export function projectProfileContext(
  profile: Pick<
    UserProfileEntity,
    'full_name' | 'preferred_name' | 'salutation' | 'locale' | 'timezone' | 'about_me' | 'use_profile_in_context'
  >,
): ProfileContextProjection | null {
  if (!profile.use_profile_in_context) {
    return null;
  }
  return {
    display_name: profile.preferred_name ?? profile.full_name,
    salutation: profile.salutation && profile.salutation !== 'none' ? profile.salutation : null,
    locale: profile.locale,
    timezone: profile.timezone,
    about_me: profile.about_me,
  };
}
