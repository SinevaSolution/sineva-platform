import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getProfile, PATCH as patchProfile } from '@/app/api/v1/me/profile/route';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { buildUserProfile } from './fakes/fake_user_profile_repository';

const mockGetProfile = vi.fn();
const mockUpdateProfile = vi.fn();

vi.mock('@/server/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/container')>();
  return {
    ...actual,
    getGetProfileUseCase: () => ({ execute: mockGetProfile }),
    getUpdateProfileUseCase: () => ({ execute: mockUpdateProfile }),
  };
});

const URL_PROFILE = 'https://app.sineva.id/api/v1/me/profile';

function patchRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(URL_PROFILE, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-test-session-user-id': 'usr-1',
      'x-sineva-action': '1',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('GET /api/v1/me/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with the profile view of the session user', async () => {
    mockGetProfile.mockResolvedValue(buildUserProfile());

    const res = await getProfile(
      new NextRequest(URL_PROFILE, { headers: { 'x-test-session-user-id': 'usr-1' } }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Object.keys(json.data).sort()).toEqual(
      [
        'avatar_url',
        'created_at',
        'email',
        'email_verified',
        'full_name',
        'id',
        'locale',
        'timezone',
      ].sort(),
    );
    expect(json.data.email_verified).toBe(true);
    expect(mockGetProfile).toHaveBeenCalledWith('usr-1');
  });

  it('returns 401 without a session', async () => {
    const res = await getProfile(
      new NextRequest(URL_PROFILE, { headers: { 'x-test-unauthenticated': 'true' } }),
    );

    expect(res.status).toBe(401);
    expect(mockGetProfile).not.toHaveBeenCalled();
  });

  it('returns 404 when the session user no longer exists', async () => {
    mockGetProfile.mockRejectedValue(new NotFoundError('User', 'usr-1'));

    const res = await getProfile(
      new NextRequest(URL_PROFILE, { headers: { 'x-test-session-user-id': 'usr-1' } }),
    );

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/me/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 and passes the session user id with the validated fields', async () => {
    mockUpdateProfile.mockResolvedValue(buildUserProfile({ full_name: 'Amira Lestari', locale: 'en' }));

    const res = await patchProfile(
      patchRequest({ full_name: '  Amira Lestari ', locale: 'en', timezone: 'Asia/Makassar' }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.full_name).toBe('Amira Lestari');
    expect(mockUpdateProfile).toHaveBeenCalledWith({
      user_id: 'usr-1',
      full_name: 'Amira Lestari',
      locale: 'en',
      timezone: 'Asia/Makassar',
    });
  });

  it('accepts a single field', async () => {
    mockUpdateProfile.mockResolvedValue(buildUserProfile({ locale: 'en' }));

    const res = await patchProfile(patchRequest({ locale: 'en' }));

    expect(res.status).toBe(200);
    expect(mockUpdateProfile).toHaveBeenCalledWith({ user_id: 'usr-1', locale: 'en' });
  });

  it('rejects a body that tries to set identity (user_id) with 422', async () => {
    const res = await patchProfile(patchRequest({ full_name: 'A', user_id: 'usr-2' }));

    expect(res.status).toBe(422);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty body object', {}],
    ['a blank full_name', { full_name: '   ' }],
    ['a 101 character full_name', { full_name: 'a'.repeat(101) }],
    ['an unsupported locale', { locale: 'fr' }],
    ['an invalid timezone', { timezone: 'Mars/Phobos' }],
  ])('returns 422 for %s', async (_label, body) => {
    const res = await patchProfile(patchRequest(body));
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.code).toBe('validation_failed');
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('returns 401 without a session', async () => {
    const res = await patchProfile(
      patchRequest({ full_name: 'A' }, { 'x-test-unauthenticated': 'true' }),
    );

    expect(res.status).toBe(401);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('returns 403 for a cookie-authenticated request without the CSRF header or an origin', async () => {
    const req = new NextRequest(URL_PROFILE, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-session-user-id': 'usr-1',
        cookie: 'sineva_session=abc',
      },
      body: JSON.stringify({ full_name: 'A' }),
    });

    const res = await patchProfile(req);

    expect(res.status).toBe(403);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('returns 404 when the session user no longer exists', async () => {
    mockUpdateProfile.mockRejectedValue(new NotFoundError('User', 'usr-1'));

    const res = await patchProfile(patchRequest({ full_name: 'A' }));

    expect(res.status).toBe(404);
  });
});
