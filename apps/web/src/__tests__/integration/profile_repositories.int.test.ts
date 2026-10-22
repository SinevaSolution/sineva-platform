import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { DEFAULT_USER_PREFERENCES } from '@/server/domain/entities/user_preferences';
import { avatarBaseKey } from '@/server/domain/profile/avatar';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';
import { PrismaUserPreferencesRepository } from '@/server/infrastructure/database/prisma_user_preferences_repository';
import { PrismaUserProfileRepository } from '@/server/infrastructure/database/prisma_user_profile_repository';
import { PrismaWorkspaceMemberRepository } from '@/server/infrastructure/database/prisma_workspace_member_repository';

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
const profiles = new PrismaUserProfileRepository(prisma);
const preferences = new PrismaUserPreferencesRepository(prisma);
const members = new PrismaWorkspaceMemberRepository(prisma);

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createUser(email: string) {
  return prisma.user.create({ data: { email, full_name: 'Amira Putri' } });
}

async function createWorkspace(slug: string) {
  return prisma.workspace.create({ data: { workspace_slug: slug, workspace_name: slug.toUpperCase() } });
}

describe('user_preferences table (WP-M0-36, FR-UX-06)', () => {
  it('has no row until the first save, and defaults come from the use case', async () => {
    const user = await createUser('prefs-a@example.com');
    expect(await preferences.find(user.id)).toBeNull();
  });

  it('creates the row on first save with column defaults for the rest, then merges', async () => {
    const user = await createUser('prefs-b@example.com');

    const first = await preferences.upsert(user.id, { theme: 'dark' });
    expect(first).toEqual({ ...DEFAULT_USER_PREFERENCES, theme: 'dark' });

    const second = await preferences.upsert(user.id, { sidebar_collapsed: true });
    expect(second).toEqual({ ...DEFAULT_USER_PREFERENCES, theme: 'dark', sidebar_collapsed: true });
    expect(await prisma.userPreferences.count({ where: { user_id: user.id } })).toBe(1);
  });

  it('keeps one row per user and isolates users', async () => {
    const a = await createUser('prefs-c@example.com');
    const b = await createUser('prefs-d@example.com');
    await preferences.upsert(a.id, { theme: 'dark' });

    expect(await preferences.find(b.id)).toBeNull();
  });

  it('is removed with the user (cascade)', async () => {
    const user = await createUser('prefs-e@example.com');
    await preferences.upsert(user.id, { theme: 'light' });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.userPreferences.count({ where: { user_id: user.id } })).toBe(0);
  });

  it('refuses a second row for the same user at the database level', async () => {
    const user = await createUser('prefs-f@example.com');
    await prisma.userPreferences.create({ data: { user_id: user.id } });
    await expect(prisma.userPreferences.create({ data: { user_id: user.id } })).rejects.toThrow();
  });
});

describe('profile repository (A2 attributes)', () => {
  it('stores and clears the optional attributes', async () => {
    const user = await createUser('profile-a@example.com');

    const saved = await profiles.update(user.id, {
      preferred_name: 'Mira',
      salutation: 'kak',
      phone_number: '+6281234567890',
      about_me: 'Bakery owner',
      use_profile_in_context: false,
    });
    expect(saved).toMatchObject({
      preferred_name: 'Mira',
      salutation: 'kak',
      phone_number: '+6281234567890',
      phone_verified: false,
      about_me: 'Bakery owner',
      use_profile_in_context: false,
    });

    const cleared = await profiles.update(user.id, { preferred_name: null, about_me: null });
    expect(cleared.preferred_name).toBeNull();
    expect(cleared.about_me).toBeNull();
    expect(cleared.salutation).toBe('kak');
  });

  it('clears phone_verified_at when the verification is reset, and leaves it otherwise', async () => {
    const user = await prisma.user.create({
      data: { email: 'profile-b@example.com', full_name: 'Amira Putri', phone_number: '+6281200000000', phone_verified_at: new Date() },
    });

    expect((await profiles.update(user.id, { about_me: 'x' })).phone_verified).toBe(true);
    expect((await profiles.update(user.id, { phone_number: '+6281299999999', reset_phone_verification: true })).phone_verified).toBe(false);
  });

  it('lists the memberships with workspace and role', async () => {
    const user = await createUser('profile-c@example.com');
    const ws = await createWorkspace('acme-profile');
    await prisma.workspaceMember.create({ data: { workspace_id: ws.id, user_id: user.id, role: 'admin' } });

    const list = await profiles.listMemberships(user.id);

    expect(list).toEqual([
      {
        workspace_id: ws.id,
        workspace_slug: 'acme-profile',
        workspace_name: 'ACME-PROFILE',
        role: 'admin',
        job_title: null,
        department: null,
      },
    ]);
  });

  it('stores the avatar key and exposes it as the authenticated route URL', async () => {
    const user = await createUser('profile-d@example.com');
    const key = avatarBaseKey(user.id, '55555555-5555-4555-8555-555555555555');

    await profiles.setAvatarKey(user.id, key);

    expect(await profiles.findAvatarKey(user.id)).toBe(key);
    expect((await profiles.findById(user.id))?.avatar_url).toBe('/api/v1/me/avatar?v=55555555-5555-4555-8555-555555555555');

    await profiles.setAvatarKey(user.id, null);
    expect((await profiles.findById(user.id))?.avatar_url).toBeNull();
  });

  it('never exposes a stored remote URL as an avatar', async () => {
    const user = await prisma.user.create({
      data: { email: 'profile-e@example.com', full_name: 'Amira Putri', avatar_url: 'https://lh3.googleusercontent.com/a/x' },
    });
    expect((await profiles.findById(user.id))?.avatar_url).toBeNull();
  });

  it('answers NotFoundError for a missing user', async () => {
    await expect(profiles.update('99999999-9999-4999-8999-999999999999', { about_me: 'x' })).rejects.toThrow(NotFoundError);
    await expect(profiles.setAvatarKey('99999999-9999-4999-8999-999999999999', null)).rejects.toThrow(NotFoundError);
  });
});

describe('workspace member own attributes (tenant scoped)', () => {
  it('updates only the caller row in the given workspace', async () => {
    const me = await createUser('member-a@example.com');
    const other = await createUser('member-b@example.com');
    const ws = await createWorkspace('acme-member');
    const otherWs = await createWorkspace('beta-member');
    await prisma.workspaceMember.create({ data: { workspace_id: ws.id, user_id: me.id } });
    await prisma.workspaceMember.create({ data: { workspace_id: ws.id, user_id: other.id } });
    await prisma.workspaceMember.create({ data: { workspace_id: otherWs.id, user_id: me.id } });

    const updated = await members.updateOwnAttributes(ws.id, me.id, { job_title: 'CFO', department: 'finance' });

    expect(updated).toMatchObject({ job_title: 'CFO', department: 'finance' });
    const untouched = await prisma.workspaceMember.findMany({
      where: { OR: [{ user_id: other.id }, { workspace_id: otherWs.id }] },
    });
    expect(untouched.every((row) => row.job_title === null)).toBe(true);
  });

  it('answers NotFoundError for a workspace the user is not in, and leaves a field alone when it is omitted', async () => {
    const me = await createUser('member-c@example.com');
    const ws = await createWorkspace('acme-member-2');
    const otherWs = await createWorkspace('beta-member-2');
    await prisma.workspaceMember.create({ data: { workspace_id: ws.id, user_id: me.id, job_title: 'CEO' } });

    await expect(members.updateOwnAttributes(otherWs.id, me.id, { job_title: 'x' })).rejects.toThrow(NotFoundError);

    const kept = await members.updateOwnAttributes(ws.id, me.id, { department: 'sales' });
    expect(kept.job_title).toBe('CEO');
  });
});
