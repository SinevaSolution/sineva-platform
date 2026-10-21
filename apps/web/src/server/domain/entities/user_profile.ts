// The slice of a user that the person may see and edit on their own profile.
// Deliberately narrower than `UserEntity`: status, 2FA state and the other
// columns stay out of this shape so they cannot leak through the profile route.
export interface UserProfileEntity {
  id: string;
  email: string;
  email_verified: boolean;
  full_name: string;
  avatar_url: string | null;
  locale: string;
  timezone: string;
  created_at: string;
}
