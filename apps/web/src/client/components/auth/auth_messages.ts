// Message key (in the `auth` namespace) for `?error=` codes the OAuth callback
// appends to /sign-in. Unknown codes map to one generic key so provider
// strings are never rendered back into the page.
const OAUTH_ERROR_KEYS: Record<string, string> = {
  access_denied: 'oauth_errors.access_denied',
  missing_code_or_state: 'oauth_errors.link_expired',
  invalid_state: 'oauth_errors.link_expired',
  email_not_verified: 'oauth_errors.email_not_verified',
};

export function oauthErrorKey(code: string | undefined): string | null {
  if (!code) return null;
  return OAUTH_ERROR_KEYS[code] ?? 'oauth_errors.generic';
}
