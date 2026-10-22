import { describe, expect, it } from 'vitest';
import { oauthErrorKey } from '@/client/components/auth/auth_messages';
import en from '../../messages/en.json';

describe('oauthErrorKey', () => {
  it('maps a cancelled sign-in to its own calm message', () => {
    expect(oauthErrorKey('access_denied')).toBe('oauth_errors.access_denied');
    expect(en.auth.oauth_errors.access_denied).toBe('Sign-in was cancelled. Try again, or use your email.');
  });

  it('treats a missing or invalid state as an expired link', () => {
    expect(oauthErrorKey('missing_code_or_state')).toBe('oauth_errors.link_expired');
    expect(oauthErrorKey('invalid_state')).toBe('oauth_errors.link_expired');
  });

  it('never echoes unknown provider codes back to the page', () => {
    expect(oauthErrorKey('<script>x</script>')).toBe('oauth_errors.generic');
  });

  it('returns nothing when there is no error', () => {
    expect(oauthErrorKey(undefined)).toBeNull();
  });
});
