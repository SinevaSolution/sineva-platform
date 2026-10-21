// Friendly text for `?error=` codes the OAuth callback appends to /sign-in.
// Unknown codes map to one generic message so provider strings are never
// rendered back into the page.
const OAUTH_ERRORS: Record<string, string> = {
  access_denied: 'Sign-in was cancelled. Try again, or use your email.',
  missing_code_or_state: 'That sign-in link expired. Try again.',
  invalid_state: 'That sign-in link expired. Try again.',
  email_not_verified:
    'Your account with that provider has no verified email. Verify it there, or sign up with email.',
};

const GENERIC = "We couldn't sign you in with that account. Try again, or use your email.";

export function oauthErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return OAUTH_ERRORS[code] ?? GENERIC;
}
