import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  newPkcePair,
  newState,
  resultRedirect,
  sanitizeReturnTo,
  sha256Hex,
} from '@/server/application/connections/oauth/oauth_support';

describe('OAuth support (FR-CONN-06, FR-CONN-10)', () => {
  it('state is 256 bits, url safe and never repeats', () => {
    const states = new Set(Array.from({ length: 1000 }, () => newState()));
    expect(states.size).toBe(1000);
    const state = newState();
    expect(Buffer.from(state, 'base64url')).toHaveLength(32);
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('PKCE challenge is the S256 of the verifier (RFC 7636 appendix B shape)', () => {
    const { verifier, challenge } = newPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(newPkcePair().verifier).not.toBe(verifier);
  });

  it('sha256Hex is the hex digest', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  describe('return_to (no open redirect)', () => {
    it.each([
      '/w/acme/connections',
      '/w/acme/connections?tab=calendar',
      '/w/acme/settings/connections#google',
    ])('accepts %s', (path) => {
      expect(sanitizeReturnTo(path)).toBe(path);
    });

    it.each([
      ['empty', ''],
      ['absolute https URL', 'https://evil.example/w/acme'],
      ['protocol relative', '//evil.example/w/acme'],
      ['protocol relative under /w/', '/w//evil.example'],
      ['javascript scheme', 'javascript:alert(1)'],
      ['not under /w/', '/admin'],
      ['root', '/'],
      ['backslash trick', '/w/acme\\..\\evil'],
      ['encoded backslash start', '/\\evil.example'],
      ['dot segment', '/w/../evil'],
      ['dot segment in the middle', '/w/acme/../../evil'],
      ['newline injection', '/w/acme\r\nSet-Cookie: x=1'],
      ['control character', '/w/acme\u0000'],
      ['too long', `/w/${'a'.repeat(600)}`],
      ['userinfo host trick', '/w/acme@evil.example'],
    ])('rejects %s', (_label, path) => {
      // The userinfo trick is harmless inside a path, so it is allowed through
      // the path check but cannot change the origin: assert the origin rule.
      const result = sanitizeReturnTo(path);
      if (_label === 'userinfo host trick') {
        expect(result === null || new URL(result, 'https://app.invalid').origin === 'https://app.invalid').toBe(true);
      } else {
        expect(result).toBeNull();
      }
    });
  });

  it('builds the callback target from the stored path and a result code only', () => {
    expect(resultRedirect('/w/acme/connections', 'connected', { provider_id: 'notion', connection_id: 'c-1' })).toBe(
      '/w/acme/connections?connection_result=connected&provider_id=notion&connection_id=c-1',
    );
    expect(resultRedirect('/w/acme/connections?tab=x', 'denied')).toBe('/w/acme/connections?tab=x&connection_result=denied');
    expect(resultRedirect('/', 'expired')).toBe('/?connection_result=expired');
  });
});
