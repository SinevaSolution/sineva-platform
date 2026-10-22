import { installHeaderSessionResolver } from './fakes/header_session_resolver';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getMe, PATCH as patchMe } from '@/app/api/v1/me/route';
import { GET as getPrefs, PATCH as patchPrefs } from '@/app/api/v1/me/preferences/route';
import { DELETE as deleteAvatar, GET as getAvatar, POST as postAvatar } from '@/app/api/v1/me/avatar/route';
import { POST as completeAvatar } from '@/app/api/v1/me/avatar/complete/route';
import { PATCH as patchMember } from '@/app/api/v1/workspaces/[workspace_id]/members/me/route';
import { NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';
import { DEFAULT_USER_PREFERENCES } from '@/server/domain/entities/user_preferences';
import { CANONICAL_PERMISSION_KEYS, hasPermission } from '@/server/domain/permissions/registry';
import { buildUserProfile } from './fakes/fake_user_profile_repository';

const USER = '11111111-1111-4111-8111-111111111111';
const WS_A = '33333333-3333-4333-8333-333333333333';
const WS_B = '66666666-6666-4666-8666-666666666666';
const UPLOAD = '44444444-4444-4444-8444-444444444444';

const m = vi.hoisted(() => ({
  getMe: vi.fn(),
  updateProfile: vi.fn(),
  getPrefs: vi.fn(),
  updatePrefs: vi.fn(),
  updateMember: vi.fn(),
  requestAvatar: vi.fn(),
  completeAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  readAvatar: vi.fn(),
}));

vi.mock('@/server/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/container')>();
  return {
    ...actual,
    getGetMeUseCase: () => ({ execute: m.getMe }),
    getUpdateProfileUseCase: () => ({ execute: m.updateProfile }),
    getGetPreferencesUseCase: () => ({ execute: m.getPrefs }),
    getUpdatePreferencesUseCase: () => ({ execute: m.updatePrefs }),
    getUpdateMemberProfileUseCase: () => ({ execute: m.updateMember }),
    getRequestAvatarUploadUseCase: () => ({ execute: m.requestAvatar }),
    getCompleteAvatarUploadUseCase: () => ({ execute: m.completeAvatar }),
    getRemoveAvatarUseCase: () => ({ execute: m.removeAvatar }),
    getReadAvatarUseCase: () => ({ execute: m.readAvatar }),
  };
});

installHeaderSessionResolver();

const base = 'https://app.sineva.id';
const session = { 'x-test-session-user-id': USER, 'x-test-session-workspaces': WS_A, 'x-test-session-role': 'member' };

function req(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${base}${path}`, {
    method,
    headers: {
      ...session,
      ...(method !== 'GET' ? { 'content-type': 'application/json', 'x-sineva-action': '1' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const me = { profile: buildUserProfile({ id: USER }), memberships: [] };

beforeEach(() => {
  vi.clearAllMocks();
  m.getMe.mockResolvedValue(me);
});

describe('GET and PATCH /api/v1/me', () => {
  it('GET returns the profile with memberships', async () => {
    m.getMe.mockResolvedValue({
      ...me,
      memberships: [
        { workspace_id: WS_A, workspace_slug: 'acme', workspace_name: 'Acme', role: 'owner', job_title: null, department: null },
      ],
    });
    const res = await getMe(req('/api/v1/me', 'GET'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.id).toBe(USER);
    expect(json.data.memberships[0].role).toBe('owner');
    expect(m.getMe).toHaveBeenCalledWith(USER);
  });

  it('GET answers 401 without a session', async () => {
    const res = await getMe(req('/api/v1/me', 'GET', undefined, { 'x-test-unauthenticated': 'true' }));
    expect(res.status).toBe(401);
    expect(m.getMe).not.toHaveBeenCalled();
  });

  it('PATCH validates, passes the session user and returns the profile with memberships', async () => {
    const res = await patchMe(
      req('/api/v1/me', 'PATCH', { preferred_name: 'Mira', phone_number: '0812-3456-7890', salutation: 'kak' }),
    );

    expect(res.status).toBe(200);
    expect(m.updateProfile).toHaveBeenCalledWith({
      user_id: USER,
      preferred_name: 'Mira',
      phone_number: '+6281234567890',
      salutation: 'kak',
      context: expect.objectContaining({ user_id: USER }),
    });
  });

  it.each([
    ['a read-only field', { email_verified_at: '2026-01-01' }],
    ['status', { status: 'active' }],
    ['an identity field', { user_id: 'someone-else', full_name: 'Amira' }],
    ['a bad phone number', { phone_number: 'abc' }],
    ['a too short name', { full_name: 'A' }],
    ['a long about_me', { about_me: 'x'.repeat(281) }],
    ['an empty body', {}],
  ])('PATCH answers 422 for %s', async (_label, body) => {
    const res = await patchMe(req('/api/v1/me', 'PATCH', body));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('validation_failed');
    expect(m.updateProfile).not.toHaveBeenCalled();
  });

  it('PATCH answers 401 without a session and 403 for a cookie request without the CSRF header', async () => {
    expect((await patchMe(req('/api/v1/me', 'PATCH', { full_name: 'Amira' }, { 'x-test-unauthenticated': 'true' }))).status).toBe(401);

    const cookie = new NextRequest(`${base}/api/v1/me`, {
      method: 'PATCH',
      headers: { ...session, 'content-type': 'application/json', cookie: 'sineva_session=abc' },
      body: JSON.stringify({ full_name: 'Amira' }),
    });
    expect((await patchMe(cookie)).status).toBe(403);
    expect(m.updateProfile).not.toHaveBeenCalled();
  });

  it('allows every role (profile.view and profile.update)', async () => {
    for (const role of ['owner', 'admin', 'member', 'viewer']) {
      const res = await patchMe(req('/api/v1/me', 'PATCH', { full_name: 'Amira' }, { 'x-test-session-role': role }));
      expect(res.status, role).toBe(200);
    }
  });
});

describe('GET and PATCH /api/v1/me/preferences', () => {
  it('GET returns the preferences', async () => {
    m.getPrefs.mockResolvedValue(DEFAULT_USER_PREFERENCES);
    const res = await getPrefs(req('/api/v1/me/preferences', 'GET'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(DEFAULT_USER_PREFERENCES);
    expect(m.getPrefs).toHaveBeenCalledWith(USER);
  });

  it('PATCH validates and merges for the session user', async () => {
    m.updatePrefs.mockResolvedValue({ ...DEFAULT_USER_PREFERENCES, theme: 'dark' });
    const res = await patchPrefs(req('/api/v1/me/preferences', 'PATCH', { theme: 'dark' }));
    expect(res.status).toBe(200);
    expect(m.updatePrefs).toHaveBeenCalledWith({
      user_id: USER,
      theme: 'dark',
      context: expect.objectContaining({ user_id: USER }),
    });
  });

  it.each([
    ['an unknown theme', { theme: 'sepia' }],
    ['an unknown key', { accent: 'red' }],
    ['identity', { theme: 'dark', user_id: 'x' }],
    ['an empty body', {}],
  ])('PATCH answers 422 for %s', async (_label, body) => {
    const res = await patchPrefs(req('/api/v1/me/preferences', 'PATCH', body));
    expect(res.status).toBe(422);
    expect(m.updatePrefs).not.toHaveBeenCalled();
  });

  it('answers 401 without a session on both methods', async () => {
    const headers = { 'x-test-unauthenticated': 'true' };
    expect((await getPrefs(req('/api/v1/me/preferences', 'GET', undefined, headers))).status).toBe(401);
    expect((await patchPrefs(req('/api/v1/me/preferences', 'PATCH', { theme: 'dark' }, headers))).status).toBe(401);
  });

  it('preferences.manage_own is registered and granted to every role', () => {
    expect(CANONICAL_PERMISSION_KEYS).toContain('preferences.manage_own');
    for (const role of ['owner', 'admin', 'member', 'viewer'] as const) {
      expect(hasPermission(role, 'preferences.manage_own').allowed).toBe(true);
    }
  });
});

describe('PATCH /api/v1/workspaces/{workspace_id}/members/me', () => {
  const url = (ws: string) => `/api/v1/workspaces/${ws}/members/me`;
  const call = (ws: string, body: unknown, headers: Record<string, string> = {}) =>
    patchMember(req(url(ws), 'PATCH', body, headers), { params: Promise.resolve({ workspace_id: ws }) });

  it('updates the own membership of the URL workspace', async () => {
    m.updateMember.mockResolvedValue({ job_title: 'CFO', department: 'finance' });
    const res = await call(WS_A, { job_title: 'CFO', department: 'finance' });

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ job_title: 'CFO', department: 'finance' });
    expect(m.updateMember).toHaveBeenCalledWith({
      user_id: USER,
      workspace_id: WS_A,
      job_title: 'CFO',
      department: 'finance',
      context: expect.objectContaining({ user_id: USER, workspace_id: WS_A }),
    });
  });

  it('answers 404 for a workspace the caller does not belong to, without touching data', async () => {
    const res = await call(WS_B, { job_title: 'CFO' });
    expect(res.status).toBe(404);
    expect(m.updateMember).not.toHaveBeenCalled();
  });

  it('answers 401 without a session', async () => {
    expect((await call(WS_A, { job_title: 'CFO' }, { 'x-test-unauthenticated': 'true' })).status).toBe(401);
  });

  it('answers 403 for a cookie request without the CSRF header', async () => {
    const cookie = new NextRequest(`${base}${url(WS_A)}`, {
      method: 'PATCH',
      headers: { ...session, 'content-type': 'application/json', cookie: 'sineva_session=abc' },
      body: JSON.stringify({ job_title: 'CFO' }),
    });
    expect((await patchMember(cookie, { params: Promise.resolve({ workspace_id: WS_A }) })).status).toBe(403);
  });

  it.each([
    ['a role', { job_title: 'CFO', role: 'owner' }],
    ['a user id', { job_title: 'CFO', user_id: 'x' }],
    ['a 61 character title', { job_title: 'a'.repeat(61) }],
    ['an unknown department', { department: 'wizardry' }],
    ['an empty body', {}],
  ])('answers 422 for %s', async (_label, body) => {
    expect((await call(WS_A, body)).status).toBe(422);
    expect(m.updateMember).not.toHaveBeenCalled();
  });
});

describe('avatar routes', () => {
  it('POST returns 201 with the upload ticket for the session user', async () => {
    m.requestAvatar.mockResolvedValue({
      upload_id: UPLOAD,
      upload_url: 'https://s3.test/x',
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      expires_in_seconds: 300,
      max_bytes: 2097152,
    });
    const res = await postAvatar(req('/api/v1/me/avatar', 'POST', { content_type: 'image/png', file_size_bytes: 1000 }));

    expect(res.status).toBe(201);
    expect(m.requestAvatar).toHaveBeenCalledWith({ user_id: USER, content_type: 'image/png', file_size_bytes: 1000 });
  });

  it.each([
    ['svg', { content_type: 'image/svg+xml', file_size_bytes: 1000 }],
    ['an oversized file', { content_type: 'image/png', file_size_bytes: 2097153 }],
    ['an identity field', { content_type: 'image/png', file_size_bytes: 10, user_id: 'x' }],
  ])('POST answers 422 for %s', async (_label, body) => {
    expect((await postAvatar(req('/api/v1/me/avatar', 'POST', body))).status).toBe(422);
    expect(m.requestAvatar).not.toHaveBeenCalled();
  });

  it('complete passes the upload id and answers 422 when the file is refused', async () => {
    m.completeAvatar.mockRejectedValue(
      new ValidationError('The image cannot be used as an avatar', [{ code: 'unsupported_image', field: 'file', detail: 'x' }]),
    );
    const res = await completeAvatar(req('/api/v1/me/avatar/complete', 'POST', { upload_id: UPLOAD }));
    expect(res.status).toBe(422);
    expect((await res.json()).errors[0].code).toBe('unsupported_image');
    expect(m.completeAvatar).toHaveBeenCalledWith(expect.objectContaining({ user_id: USER, upload_id: UPLOAD }));
  });

  it('complete answers 404 for an unknown upload and 422 for a non uuid id', async () => {
    m.completeAvatar.mockRejectedValue(new NotFoundError('Avatar upload', UPLOAD));
    expect((await completeAvatar(req('/api/v1/me/avatar/complete', 'POST', { upload_id: UPLOAD }))).status).toBe(404);
    expect((await completeAvatar(req('/api/v1/me/avatar/complete', 'POST', { upload_id: '../../x' }))).status).toBe(422);
  });

  it('DELETE removes the avatar', async () => {
    m.removeAvatar.mockResolvedValue(buildUserProfile({ id: USER }));
    const res = await deleteAvatar(req('/api/v1/me/avatar', 'DELETE'));
    expect(res.status).toBe(200);
    expect(m.removeAvatar).toHaveBeenCalledWith(expect.objectContaining({ user_id: USER }));
  });

  it('GET streams the stored bytes with a private cache and nosniff', async () => {
    m.readAvatar.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), content_type: 'image/webp' });
    const res = await getAvatar(req('/api/v1/me/avatar?size=64', 'GET'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toContain('private');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(m.readAvatar).toHaveBeenCalledWith({ user_id: USER, size: 64 });
  });

  it('GET answers 404 without an avatar and 422 for an unsupported size', async () => {
    m.readAvatar.mockRejectedValue(new NotFoundError('Avatar', USER));
    expect((await getAvatar(req('/api/v1/me/avatar', 'GET'))).status).toBe(404);
    expect((await getAvatar(req('/api/v1/me/avatar?size=999', 'GET'))).status).toBe(422);
  });

  it('every avatar method answers 401 without a session', async () => {
    const h = { 'x-test-unauthenticated': 'true' };
    expect((await getAvatar(req('/api/v1/me/avatar', 'GET', undefined, h))).status).toBe(401);
    expect((await postAvatar(req('/api/v1/me/avatar', 'POST', { content_type: 'image/png', file_size_bytes: 1 }, h))).status).toBe(401);
    expect((await deleteAvatar(req('/api/v1/me/avatar', 'DELETE', undefined, h))).status).toBe(401);
    expect((await completeAvatar(req('/api/v1/me/avatar/complete', 'POST', { upload_id: UPLOAD }, h))).status).toBe(401);
  });
});
