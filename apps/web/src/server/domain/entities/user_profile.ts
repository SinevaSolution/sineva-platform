// The slice of a user that the person may see and edit on their own profile.
// Deliberately narrower than `UserEntity`: status, 2FA state and the other
// columns stay out of this shape so they cannot leak through the profile route.

// Closed lists live in the domain so the DTO, the repository adapters and the
// UI model read one definition.
export const SALUTATIONS = ['none', 'pak', 'bu', 'kak', 'mas', 'mbak'] as const;
export type SalutationValue = (typeof SALUTATIONS)[number];

export const DEPARTMENTS = [
  'management',
  'finance',
  'sales',
  'marketing',
  'operations',
  'hr',
  'it',
  'customer_support',
  'legal',
  'other',
] as const;
export type DepartmentValue = (typeof DEPARTMENTS)[number];

export interface UserProfileEntity {
  id: string;
  email: string;
  email_verified: boolean;
  full_name: string;
  preferred_name: string | null;
  salutation: SalutationValue | null;
  /** E.164, or null. Never sent to the model. */
  phone_number: string | null;
  /** Whether the number has been verified; the verification flow is a later package. */
  phone_verified: boolean;
  about_me: string | null;
  use_profile_in_context: boolean;
  /**
   * Browser-readable URL of the stored avatar, or null. The stored value is an
   * object key; the repository maps it through `avatarUrlForKey`.
   */
  avatar_url: string | null;
  locale: string;
  timezone: string;
  created_at: string;
}

/** One workspace the user belongs to, as listed on `GET /api/v1/me`. */
export interface UserMembershipSummary {
  workspace_id: string;
  workspace_slug: string;
  workspace_name: string;
  role: string;
  job_title: string | null;
  department: DepartmentValue | null;
}
