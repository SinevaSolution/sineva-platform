import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorKey } from '@/client/lib/api';
import { flattenMessages } from '@sineva/i18n';
import { UpdateProfileSchema } from '@/server/application/dtos/profile_dto';
import en from '../../messages/en.json';
import id from '../../messages/id.json';

const err = (status: number, code?: string, detailCodes: string[] = []) =>
  new ApiError('server text that must never reach the screen', status, code, detailCodes);

describe('apiErrorKey: copy maps from the machine code, never from the API message', () => {
  it.each([
    [0, undefined, [], 'api.network'],
    [401, 'unauthenticated', [], 'api.unauthenticated'],
    [403, 'forbidden', [], 'api.forbidden'],
    [404, 'not_found', [], 'api.not_found'],
    [409, 'conflict', [], 'api.conflict'],
    [422, 'validation_failed', [], 'api.validation_failed'],
    [429, 'rate_limited', [], 'api.rate_limited'],
    [500, 'internal_error', [], 'api.internal_error'],
    [502, 'model_unavailable', [], 'api.model_unavailable'],
    [503, 'dependency_unavailable', [], 'api.dependency_unavailable'],
  ] as const)('status %s code %s gives %s', (status, code, detail, key) => {
    expect(apiErrorKey(err(status, code, [...detail]))).toBe(key);
  });

  it('prefers a specific detail code over the generic validation code', () => {
    expect(apiErrorKey(err(422, 'validation_failed', ['breached_password']))).toBe('api.breached_password');
    expect(apiErrorKey(err(422, 'validation_failed', ['invalid_password']))).toBe('api.invalid_password');
    expect(apiErrorKey(err(422, 'validation_failed', ['terms_required']))).toBe('api.terms_required');
  });

  it('maps the Library detail codes and the plan limit to plain copy', () => {
    expect(apiErrorKey(err(409, 'already_in_library', ['already_in_library']))).toBe('api.already_in_library');
    expect(apiErrorKey(err(409, 'folder_not_empty', ['folder_not_empty']))).toBe('api.folder_not_empty');
    expect(apiErrorKey(err(422, 'validation_failed', ['folder_depth_exceeded']))).toBe('api.folder_depth_exceeded');
    expect(apiErrorKey(err(422, 'validation_failed', ['unsupported_file_type']))).toBe('api.unsupported_file_type');
    expect(apiErrorKey(err(422, 'validation_failed', ['file_too_large']))).toBe('api.file_too_large');
    expect(apiErrorKey(err(403, 'entitlement_required'))).toBe('api.entitlement_required');
  });

  it('falls back to the status when the envelope had no code', () => {
    expect(apiErrorKey(err(429))).toBe('api.rate_limited');
    expect(apiErrorKey(err(503))).toBe('api.dependency_unavailable');
    expect(apiErrorKey(err(418))).toBe('api.generic');
  });

  it('gives a generic key for anything that is not an ApiError', () => {
    expect(apiErrorKey(new Error('boom'))).toBe('api.generic');
    expect(apiErrorKey(null)).toBe('api.generic');
  });

  it('only returns keys that exist in both catalogs', () => {
    const keys = [
      apiErrorKey(err(0)),
      apiErrorKey(err(401, 'unauthenticated')),
      apiErrorKey(err(403, 'forbidden')),
      apiErrorKey(err(404, 'not_found')),
      apiErrorKey(err(409, 'conflict')),
      apiErrorKey(err(422, 'validation_failed')),
      apiErrorKey(err(429)),
      apiErrorKey(err(500, 'internal_error')),
      apiErrorKey(err(502, 'model_unavailable')),
      apiErrorKey(err(503, 'dependency_unavailable')),
      apiErrorKey(err(422, 'x', ['breached_password'])),
      apiErrorKey(err(422, 'x', ['invalid_password'])),
      apiErrorKey(err(422, 'x', ['terms_required'])),
      apiErrorKey(err(422, 'x', ['privacy_required'])),
      apiErrorKey(err(409, 'x', ['already_in_library'])),
      apiErrorKey(err(409, 'x', ['folder_not_empty'])),
      apiErrorKey(err(422, 'x', ['folder_depth_exceeded'])),
      apiErrorKey(err(422, 'x', ['unsupported_file_type'])),
      apiErrorKey(err(422, 'x', ['file_too_large'])),
      apiErrorKey(err(403, 'entitlement_required')),
      apiErrorKey(null),
    ];
    for (const catalog of [en, id]) {
      const flat = flattenMessages(catalog);
      for (const key of keys) {
        expect(flat[`errors.${key}`], key).toBeTruthy();
      }
    }
  });

  it('keeps 502 and 503 retryable', () => {
    expect(err(502).retryable).toBe(true);
    expect(err(503).retryable).toBe(true);
    expect(err(500).retryable).toBe(false);
  });
});

describe('profile locale validation', () => {
  it('accepts every enabled locale from the registry', () => {
    expect(UpdateProfileSchema.safeParse({ locale: 'id' }).success).toBe(true);
    expect(UpdateProfileSchema.safeParse({ locale: 'en' }).success).toBe(true);
  });

  it('rejects a locale the registry does not enable', () => {
    expect(UpdateProfileSchema.safeParse({ locale: 'fr' }).success).toBe(false);
    expect(UpdateProfileSchema.safeParse({ locale: 'ID' }).success).toBe(false);
  });
});
