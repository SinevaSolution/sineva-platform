import { beforeEach, describe, expect, it } from 'vitest';
import { RequestAvatarUploadSchema } from '@/server/application/dtos/avatar_dto';
import { CompleteAvatarUploadUseCase } from '@/server/application/use-cases/profile/complete_avatar_upload_use_case';
import { GetMeUseCase } from '@/server/application/use-cases/profile/get_me_use_case';
import { GetPreferencesUseCase } from '@/server/application/use-cases/profile/get_preferences_use_case';
import { ImportOAuthAvatarUseCase } from '@/server/application/use-cases/profile/import_oauth_avatar_use_case';
import { ReadAvatarUseCase } from '@/server/application/use-cases/profile/read_avatar_use_case';
import { RemoveAvatarUseCase } from '@/server/application/use-cases/profile/remove_avatar_use_case';
import { RequestAvatarUploadUseCase } from '@/server/application/use-cases/profile/request_avatar_upload_use_case';
import { UpdateMemberProfileUseCase } from '@/server/application/use-cases/profile/update_member_profile_use_case';
import { UpdatePreferencesUseCase } from '@/server/application/use-cases/profile/update_preferences_use_case';
import { UpdateProfileUseCase } from '@/server/application/use-cases/profile/update_profile_use_case';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import { DEFAULT_USER_PREFERENCES } from '@/server/domain/entities/user_preferences';
import { NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';
import {
  avatarBaseKey,
  avatarVariantKey,
  AVATAR_MAX_BYTES,
  detectImageType,
  pendingAvatarKey,
} from '@/server/domain/profile/avatar';
import { projectProfileContext } from '@/server/domain/profile/profile_context_projection';
import type { WorkspaceMemberEntity } from '@/server/domain/entities/user';
import type { WorkspaceMemberRepository } from '@/server/domain/repositories/workspace_member_repository';
import { FakeAvatarImageProcessor } from './fakes/fake_avatar_image_processor';
import { FakeObjectStore } from './fakes/fake_object_store';
import { FakeUserPreferencesRepository } from './fakes/fake_user_preferences_repository';
import { buildUserProfile, FakeUserProfileRepository } from './fakes/fake_user_profile_repository';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const WORKSPACE = '33333333-3333-4333-8333-333333333333';
const UPLOAD = '44444444-4444-4444-8444-444444444444';
const VERSION = '55555555-5555-4555-8555-555555555555';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe('UpdateProfileUseCase with the extended attributes', () => {
  let repo: FakeUserProfileRepository;
  let audit: CountingAuditLogger;
  let useCase: UpdateProfileUseCase;

  beforeEach(() => {
    repo = new FakeUserProfileRepository();
    repo.seed(buildUserProfile({ id: USER, phone_number: '+6281200000000', phone_verified: true }));
    repo.seed(buildUserProfile({ id: OTHER, full_name: 'Someone Else' }));
    audit = new CountingAuditLogger();
    useCase = new UpdateProfileUseCase(repo, audit);
  });

  it('saves preferred_name, salutation, about_me and the context flag', async () => {
    const updated = await useCase.execute({
      user_id: USER,
      preferred_name: 'Mira',
      salutation: 'bu',
      about_me: 'I run a bakery.',
      use_profile_in_context: false,
    });

    expect(updated).toMatchObject({
      preferred_name: 'Mira',
      salutation: 'bu',
      about_me: 'I run a bakery.',
      use_profile_in_context: false,
    });
  });

  it('clears an optional attribute with null', async () => {
    await useCase.execute({ user_id: USER, preferred_name: 'Mira' });
    const updated = await useCase.execute({ user_id: USER, preferred_name: null });
    expect(updated.preferred_name).toBeNull();
  });

  it('drops the phone verification when the number changes', async () => {
    const updated = await useCase.execute({ user_id: USER, phone_number: '+6281299999999' });
    expect(updated.phone_number).toBe('+6281299999999');
    expect(updated.phone_verified).toBe(false);
  });

  it('keeps the phone verification when the same number is saved again', async () => {
    const updated = await useCase.execute({ user_id: USER, phone_number: '+6281200000000' });
    expect(updated.phone_verified).toBe(true);
    expect(repo.updateCalls[0]?.input.reset_phone_verification).toBeFalsy();
  });

  it('audits user.profile_updated with the field names and never writes the phone number in metadata', async () => {
    await useCase.execute({ user_id: USER, phone_number: '+6281299999999', salutation: 'pak' });

    const [event] = audit.getEvents();
    expect(event?.action).toBe('user.profile_updated');
    expect(event?.metadata).toEqual({ changed_fields: ['phone_number', 'salutation'] });
    expect(JSON.stringify(event?.metadata)).not.toContain('+62812');
  });
});

describe('GetMeUseCase', () => {
  it('returns the profile with the memberships and roles', async () => {
    const repo = new FakeUserProfileRepository();
    repo.seed(buildUserProfile({ id: USER }));
    repo.memberships.set(USER, [
      {
        workspace_id: WORKSPACE,
        workspace_slug: 'acme',
        workspace_name: 'Acme',
        role: 'owner',
        job_title: 'Founder',
        department: 'management',
      },
    ]);

    const me = await new GetMeUseCase(repo).execute(USER);

    expect(me.profile.id).toBe(USER);
    expect(me.memberships).toHaveLength(1);
    expect(me.memberships[0]).toMatchObject({ workspace_slug: 'acme', role: 'owner' });
  });

  it('throws NotFoundError for a missing user', async () => {
    await expect(new GetMeUseCase(new FakeUserProfileRepository()).execute(USER)).rejects.toThrow(NotFoundError);
  });
});

describe('preferences use cases (FR-UX-06)', () => {
  it('returns the defaults and writes nothing when the user never saved', async () => {
    const repo = new FakeUserPreferencesRepository();
    expect(await new GetPreferencesUseCase(repo).execute(USER)).toEqual(DEFAULT_USER_PREFERENCES);
    expect(repo.rows.size).toBe(0);
  });

  it('merges only the provided fields and audits user.preferences_updated', async () => {
    const repo = new FakeUserPreferencesRepository();
    const audit = new CountingAuditLogger();
    const useCase = new UpdatePreferencesUseCase(repo, audit);

    await useCase.execute({ user_id: USER, theme: 'dark' });
    const second = await useCase.execute({ user_id: USER, sidebar_collapsed: true });

    expect(second).toEqual({ ...DEFAULT_USER_PREFERENCES, theme: 'dark', sidebar_collapsed: true });
    expect(audit.getEvents().map((e) => e.action)).toEqual(['user.preferences_updated', 'user.preferences_updated']);
    expect(audit.getEvents()[1]?.metadata).toEqual({ changed_fields: ['sidebar_collapsed'] });
  });

  it('never writes another user row', async () => {
    const repo = new FakeUserPreferencesRepository();
    await new UpdatePreferencesUseCase(repo, new CountingAuditLogger()).execute({ user_id: USER, theme: 'dark' });
    expect([...repo.rows.keys()]).toEqual([USER]);
  });
});

describe('UpdateMemberProfileUseCase', () => {
  function memberRepo() {
    const calls: Array<{ workspace_id: string; user_id: string; input: unknown }> = [];
    const repo = {
      calls,
      async updateOwnAttributes(workspace_id: string, user_id: string, input: unknown) {
        calls.push({ workspace_id, user_id, input });
        if (user_id !== USER) throw new NotFoundError('Member', user_id);
        return { user_id, workspace_id, job_title: 'CFO', department: 'finance' } as WorkspaceMemberEntity;
      },
    } as unknown as WorkspaceMemberRepository & { calls: typeof calls };
    return repo;
  }

  it('updates the caller own membership in the URL workspace and audits member.profile_updated', async () => {
    const repo = memberRepo();
    const audit = new CountingAuditLogger();
    const updated = await new UpdateMemberProfileUseCase(repo, audit).execute({
      user_id: USER,
      workspace_id: WORKSPACE,
      job_title: 'CFO',
      department: 'finance',
    });

    expect(updated.job_title).toBe('CFO');
    expect(repo.calls).toEqual([
      { workspace_id: WORKSPACE, user_id: USER, input: { job_title: 'CFO', department: 'finance' } },
    ]);
    const [event] = audit.getEvents();
    expect(event?.action).toBe('member.profile_updated');
    expect(event?.workspace_id).toBe(WORKSPACE);
    expect(event?.metadata).toEqual({ changed_fields: ['job_title', 'department'] });
  });

  it('propagates NotFoundError for a user that is not a member', async () => {
    await expect(
      new UpdateMemberProfileUseCase(memberRepo(), new CountingAuditLogger()).execute({
        user_id: OTHER,
        workspace_id: WORKSPACE,
        job_title: 'CFO',
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('avatar rules', () => {
  it('detects JPEG, PNG and WebP by magic bytes and refuses SVG and text', () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(detectImageType(PNG)).toBe('png');
    const webp = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBP')]);
    expect(detectImageType(webp)).toBe('webp');
    expect(detectImageType(SVG)).toBeNull();
    expect(detectImageType(new TextEncoder().encode('GIF89a......'))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });

  it('builds keys only from UUIDs', () => {
    expect(() => pendingAvatarKey('../etc', UPLOAD)).toThrow(ValidationError);
    expect(() => pendingAvatarKey(USER, '../../x')).toThrow(ValidationError);
    expect(pendingAvatarKey(USER, UPLOAD)).toBe(`avatars/pending/${USER}/${UPLOAD}`);
  });

  it('RequestAvatarUploadSchema accepts jpeg, png, webp up to 2 MB and nothing else', () => {
    const ok = (body: unknown) => RequestAvatarUploadSchema.safeParse(body).success;
    expect(ok({ content_type: 'image/png', file_size_bytes: 1000 })).toBe(true);
    expect(ok({ content_type: 'image/jpeg', file_size_bytes: AVATAR_MAX_BYTES })).toBe(true);
    expect(ok({ content_type: 'image/webp', file_size_bytes: 1 })).toBe(true);
    expect(ok({ content_type: 'image/svg+xml', file_size_bytes: 1000 })).toBe(false);
    expect(ok({ content_type: 'image/gif', file_size_bytes: 1000 })).toBe(false);
    expect(ok({ content_type: 'image/png', file_size_bytes: AVATAR_MAX_BYTES + 1 })).toBe(false);
    expect(ok({ content_type: 'image/png', file_size_bytes: 0 })).toBe(false);
    expect(ok({ content_type: 'image/png', file_size_bytes: 10, user_id: OTHER })).toBe(false);
  });
});

describe('RequestAvatarUploadUseCase', () => {
  it('presigns a PUT to a pending key under the session user and pins the type and size', async () => {
    const store = new FakeObjectStore();
    const result = await new RequestAvatarUploadUseCase(store, () => UPLOAD).execute({
      user_id: USER,
      content_type: 'image/png',
      file_size_bytes: 5000,
    });

    expect(store.presigns).toEqual([
      { key: `avatars/pending/${USER}/${UPLOAD}`, content_type: 'image/png', size_bytes: 5000 },
    ]);
    expect(result.upload_id).toBe(UPLOAD);
    expect(result.method).toBe('PUT');
    expect(result.headers).toEqual({ 'Content-Type': 'image/png' });
    expect(result.max_bytes).toBe(AVATAR_MAX_BYTES);
  });
});

describe('CompleteAvatarUploadUseCase', () => {
  let profiles: FakeUserProfileRepository;
  let store: FakeObjectStore;
  let processor: FakeAvatarImageProcessor;
  let audit: CountingAuditLogger;
  let useCase: CompleteAvatarUploadUseCase;

  beforeEach(() => {
    profiles = new FakeUserProfileRepository();
    profiles.seed(buildUserProfile({ id: USER }));
    store = new FakeObjectStore();
    processor = new FakeAvatarImageProcessor();
    audit = new CountingAuditLogger();
    useCase = new CompleteAvatarUploadUseCase({ profiles, store, processor, audit, newId: () => VERSION });
  });

  it('re-encodes the pending upload into both sizes, stores the key, removes the pending object and audits', async () => {
    store.upload(pendingAvatarKey(USER, UPLOAD), PNG);

    const profile = await useCase.execute({ user_id: USER, upload_id: UPLOAD });

    const base = avatarBaseKey(USER, VERSION);
    expect(store.objects.get(avatarVariantKey(base, 256))?.content_type).toBe('image/webp');
    expect(store.objects.has(avatarVariantKey(base, 64))).toBe(true);
    expect(store.objects.has(pendingAvatarKey(USER, UPLOAD))).toBe(false);
    expect(profiles.avatarKeys.get(USER)).toBe(base);
    expect(profile.avatar_url).toBe(`/api/v1/me/avatar?v=${VERSION}`);
    expect(audit.getEvents()[0]).toMatchObject({ action: 'user.avatar_updated', metadata: { action: 'uploaded' } });
  });

  it('rejects an SVG even when the browser declared image/png, and deletes it', async () => {
    store.upload(pendingAvatarKey(USER, UPLOAD), SVG);

    await expect(useCase.execute({ user_id: USER, upload_id: UPLOAD })).rejects.toThrow(ValidationError);

    expect(processor.inputs).toHaveLength(0);
    expect(store.objects.has(pendingAvatarKey(USER, UPLOAD))).toBe(false);
    expect(profiles.avatarKeys.get(USER) ?? null).toBeNull();
  });

  it('rejects an object over 2 MB', async () => {
    const big = new Uint8Array(AVATAR_MAX_BYTES + 10);
    big.set(PNG);
    store.upload(pendingAvatarKey(USER, UPLOAD), big);

    await expect(useCase.execute({ user_id: USER, upload_id: UPLOAD })).rejects.toThrow(ValidationError);
    expect(store.objects.has(pendingAvatarKey(USER, UPLOAD))).toBe(false);
  });

  it('answers NotFoundError when nothing was uploaded under that id', async () => {
    await expect(useCase.execute({ user_id: USER, upload_id: UPLOAD })).rejects.toThrow(NotFoundError);
  });

  it('cannot complete another user pending upload (the key carries the session user)', async () => {
    store.upload(pendingAvatarKey(OTHER, UPLOAD), PNG);
    await expect(useCase.execute({ user_id: USER, upload_id: UPLOAD })).rejects.toThrow(NotFoundError);
  });

  it('replaces the previous avatar and reports cleanup failures instead of hiding them', async () => {
    const previous = avatarBaseKey(USER, '66666666-6666-4666-8666-666666666666');
    profiles.avatarKeys.set(USER, previous);
    store.upload(avatarVariantKey(previous, 256), new Uint8Array([1]));
    store.upload(avatarVariantKey(previous, 64), new Uint8Array([1]));
    store.failDelete.add(avatarVariantKey(previous, 64));
    store.upload(pendingAvatarKey(USER, UPLOAD), PNG);

    await useCase.execute({ user_id: USER, upload_id: UPLOAD });

    expect(store.objects.has(avatarVariantKey(previous, 256))).toBe(false);
    expect(audit.getEvents()[0]?.metadata).toMatchObject({ cleanup_failed_count: 1 });
  });
});

describe('RemoveAvatarUseCase and ReadAvatarUseCase', () => {
  it('removes both variants, clears the key and audits user.avatar_updated removed', async () => {
    const profiles = new FakeUserProfileRepository();
    profiles.seed(buildUserProfile({ id: USER }));
    const store = new FakeObjectStore();
    const audit = new CountingAuditLogger();
    const base = avatarBaseKey(USER, VERSION);
    profiles.avatarKeys.set(USER, base);
    store.upload(avatarVariantKey(base, 256), new Uint8Array([1]));
    store.upload(avatarVariantKey(base, 64), new Uint8Array([1]));

    const profile = await new RemoveAvatarUseCase(profiles, store, audit).execute({ user_id: USER });

    expect(store.objects.size).toBe(0);
    expect(profile.avatar_url).toBeNull();
    expect(audit.getEvents()[0]).toMatchObject({ action: 'user.avatar_updated', metadata: { action: 'removed' } });
  });

  it('reads the requested size, and 404s without an avatar', async () => {
    const profiles = new FakeUserProfileRepository();
    profiles.seed(buildUserProfile({ id: USER }));
    const store = new FakeObjectStore();
    const read = new ReadAvatarUseCase(profiles, store);

    await expect(read.execute({ user_id: USER, size: 64 })).rejects.toThrow(NotFoundError);

    const base = avatarBaseKey(USER, VERSION);
    profiles.avatarKeys.set(USER, base);
    store.upload(avatarVariantKey(base, 64), new Uint8Array([9, 9]));
    const result = await read.execute({ user_id: USER, size: 64 });
    expect([...result.bytes]).toEqual([9, 9]);
    expect(result.content_type).toBe('image/webp');
  });
});

describe('ImportOAuthAvatarUseCase (copied once, never hotlinked)', () => {
  function build(fetched: Uint8Array | null) {
    const profiles = new FakeUserProfileRepository();
    profiles.seed(buildUserProfile({ id: USER }));
    const store = new FakeObjectStore();
    const audit = new CountingAuditLogger();
    const fetched_urls: string[] = [];
    const useCase = new ImportOAuthAvatarUseCase({
      profiles,
      store,
      processor: new FakeAvatarImageProcessor(),
      audit,
      newId: () => VERSION,
      fetcher: {
        async fetch(url: string) {
          fetched_urls.push(url);
          return fetched;
        },
      },
    });
    return { profiles, store, audit, useCase, fetched_urls };
  }

  it('downloads the remote image once and stores a local copy', async () => {
    const { profiles, useCase, fetched_urls, audit } = build(PNG);

    await useCase.execute({ user_id: USER, remote_url: 'https://lh3.googleusercontent.com/a/x', provider: 'google' });
    await useCase.execute({ user_id: USER, remote_url: 'https://lh3.googleusercontent.com/a/x', provider: 'google' });

    expect(fetched_urls).toHaveLength(1);
    expect(profiles.avatarKeys.get(USER)).toBe(avatarBaseKey(USER, VERSION));
    expect(profiles.profiles.get(USER)?.avatar_url).not.toContain('googleusercontent');
    expect(audit.getEvents()[0]?.metadata).toMatchObject({ action: 'imported', provider: 'google' });
  });

  it('skips quietly with no write when the download fails', async () => {
    const { profiles, useCase, audit } = build(null);
    await useCase.execute({ user_id: USER, remote_url: 'https://lh3.googleusercontent.com/a/x', provider: 'google' });
    expect(profiles.avatarKeys.get(USER) ?? null).toBeNull();
    expect(audit.getEventCount()).toBe(0);
  });

  it('skips when the downloaded bytes are not a supported image', async () => {
    const { profiles, useCase } = build(SVG);
    await useCase.execute({ user_id: USER, remote_url: 'https://avatars.githubusercontent.com/u/1', provider: 'github' });
    expect(profiles.avatarKeys.get(USER) ?? null).toBeNull();
  });
});

describe('ProfileContextProjection (what may reach the model)', () => {
  it('contains exactly the allowed claims and no email, phone or avatar', () => {
    const projection = projectProfileContext(
      buildUserProfile({
        preferred_name: 'Mira',
        salutation: 'bu',
        about_me: 'Bakery owner',
        phone_number: '+6281200000000',
        avatar_url: '/api/v1/me/avatar?v=x',
      }),
    );

    expect(projection).toEqual({
      display_name: 'Mira',
      salutation: 'bu',
      locale: 'id',
      timezone: 'Asia/Jakarta',
      about_me: 'Bakery owner',
    });
    expect(Object.keys(projection ?? {}).sort()).toEqual(['about_me', 'display_name', 'locale', 'salutation', 'timezone']);
    const serialised = JSON.stringify(projection);
    expect(serialised).not.toContain('amira@example.com');
    expect(serialised).not.toContain('+6281200000000');
    expect(serialised).not.toContain('avatar');
  });

  it('falls back to the full name and drops a none salutation', () => {
    expect(projectProfileContext(buildUserProfile({ salutation: 'none' }))).toMatchObject({
      display_name: 'Amira Putri',
      salutation: null,
    });
  });

  it('is null when the person turned the profile off as context', () => {
    expect(projectProfileContext(buildUserProfile({ use_profile_in_context: false }))).toBeNull();
  });
});
