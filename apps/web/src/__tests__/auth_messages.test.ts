import { describe, expect, it } from 'vitest';
import { oauthErrorMessage } from '@/client/components/auth/auth_messages';

describe('oauthErrorMessage', () => {
  it('explains a cancelled sign-in calmly', () => {
    expect(oauthErrorMessage('access_denied')).toBe(
      'Sign-in was cancelled. Try again, or use your email.',
    );
  });

  it('never echoes unknown provider codes back to the page', () => {
    expect(oauthErrorMessage('<script>x</script>')).toBe(
      "We couldn't sign you in with that account. Try again, or use your email.",
    );
  });

  it('returns nothing when there is no error', () => {
    expect(oauthErrorMessage(undefined)).toBeNull();
  });
});
