import { describe, expect, it } from 'vitest';
import { errorCodeToMessageKey } from './error_messages';

// The keys must match apps/web/src/client/lib/api.ts (`apiErrorKey`) and the
// `errors.api.*` catalog in apps/web/messages/en.json.
describe('errorCodeToMessageKey', () => {
  it.each([
    ['network', 'api.network'],
    ['unauthenticated', 'api.unauthenticated'],
    ['forbidden', 'api.forbidden'],
    ['not_found', 'api.not_found'],
    ['conflict', 'api.conflict'],
    ['validation_failed', 'api.validation_failed'],
    ['rate_limited', 'api.rate_limited'],
    ['internal_error', 'api.internal_error'],
    ['model_unavailable', 'api.model_unavailable'],
    ['dependency_unavailable', 'api.dependency_unavailable'],
  ])('maps envelope code %s', (code, key) => {
    expect(errorCodeToMessageKey(code)).toBe(key);
  });

  it.each([
    ['breached_password', 'api.breached_password'],
    ['invalid_password', 'api.invalid_password'],
    ['terms_required', 'api.terms_required'],
    ['privacy_required', 'api.privacy_required'],
    ['unsupported_image', 'api.unsupported_image'],
    ['image_too_large', 'api.image_too_large'],
    ['invalid_image', 'api.invalid_image'],
    ['upload_failed', 'api.upload_failed'],
  ])('maps detail code %s', (code, key) => {
    expect(errorCodeToMessageKey(code)).toBe(key);
  });

  it('falls back to api.generic for an unknown code', () => {
    expect(errorCodeToMessageKey('something_new')).toBe('api.generic');
    expect(errorCodeToMessageKey('')).toBe('api.generic');
  });

  it('does not resolve inherited object properties', () => {
    for (const code of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(errorCodeToMessageKey(code)).toBe('api.generic');
    }
  });
});
