import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Tenancy & Auth Database Constraints Integration Tests (WP-M0-21)', () => {
  it('enforces UUID primary keys on all created entities (ADR-0014, R-21)', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'alice@sineva.ai',
        full_name: 'Alice Pratama',
      },
    });

    const workspace = await prisma.workspace.create({
      data: {
        workspace_slug: 'corp-alpha',
        workspace_name: 'Corp Alpha',
        owner_user_id: user.id,
      },
    });

    const member = await prisma.workspaceMember.create({
      data: {
        workspace_id: workspace.id,
        user_id: user.id,
        role: 'owner',
      },
    });

    expect(user.id).toMatch(UUID_PATTERN);
    expect(workspace.id).toMatch(UUID_PATTERN);
    expect(member.id).toMatch(UUID_PATTERN);
  });

  it('enforces composite uniqueness on (workspace_id, user_id) in workspace_members', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'bob@sineva.ai',
        full_name: 'Bob Hartanto',
      },
    });

    const workspace = await prisma.workspace.create({
      data: {
        workspace_slug: 'corp-beta',
        workspace_name: 'Corp Beta',
      },
    });

    await prisma.workspaceMember.create({
      data: {
        workspace_id: workspace.id,
        user_id: user.id,
        role: 'member',
      },
    });

    // Inserting a second membership for the same user in the same workspace must fail
    await expect(
      prisma.workspaceMember.create({
        data: {
          workspace_id: workspace.id,
          user_id: user.id,
          role: 'viewer',
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces at most one owner per workspace via partial unique index', async () => {
    const owner1 = await prisma.user.create({
      data: {
        email: 'owner1@sineva.ai',
        full_name: 'Owner One',
      },
    });

    const owner2 = await prisma.user.create({
      data: {
        email: 'owner2@sineva.ai',
        full_name: 'Owner Two',
      },
    });

    const workspace = await prisma.workspace.create({
      data: {
        workspace_slug: 'single-owner-ws',
        workspace_name: 'Single Owner WS',
      },
    });

    await prisma.workspaceMember.create({
      data: {
        workspace_id: workspace.id,
        user_id: owner1.id,
        role: 'owner',
      },
    });

    // Attempting to add a second owner to the same workspace must fail against the partial unique index
    await expect(
      prisma.workspaceMember.create({
        data: {
          workspace_id: workspace.id,
          user_id: owner2.id,
          role: 'owner',
        },
      }),
    ).rejects.toThrow();

    // Adding owner2 as an admin or member should succeed
    const admin = await prisma.workspaceMember.create({
      data: {
        workspace_id: workspace.id,
        user_id: owner2.id,
        role: 'admin',
      },
    });
    expect(admin.role).toBe('admin');
  });

  it('enforces uniqueness on (provider_id, account_id) in accounts', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'charlie@sineva.ai',
        full_name: 'Charlie Wijaya',
      },
    });

    await prisma.account.create({
      data: {
        user_id: user.id,
        provider_id: 'google',
        account_id: 'google-oauth-123456',
      },
    });

    // Inserting another account with identical provider and account_id must fail
    await expect(
      prisma.account.create({
        data: {
          user_id: user.id,
          provider_id: 'google',
          account_id: 'google-oauth-123456',
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces lowercase unique email on users', async () => {
    await prisma.user.create({
      data: {
        email: 'david@sineva.ai',
        full_name: 'David Salim',
      },
    });

    await expect(
      prisma.user.create({
        data: {
          email: 'david@sineva.ai',
          full_name: 'David Duplicate',
        },
      }),
    ).rejects.toThrow();
  });
});
