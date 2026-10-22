import crypto from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/server/infrastructure/database/generated/client';

// Standalone script: it deliberately does not import `prisma_client.ts`, which
// carries `import 'server-only'` and would throw when run outside a Next build.

async function seedTenants(prisma: PrismaClient): Promise<void> {
  // Tenant 1: Sineva HQ
  const user1 = await prisma.user.upsert({
    where: { email: 'admin@sineva.id' },
    create: {
      email: 'admin@sineva.id',
      full_name: 'Alice Pratama',
      preferred_name: 'Alice',
      locale: 'id',
      timezone: 'Asia/Jakarta',
      status: 'active',
      email_verified: true,
      email_verified_at: new Date('2026-10-01T08:00:00.000Z'),
    },
    update: {
      full_name: 'Alice Pratama',
      status: 'active',
    },
  });

  const ws1 = await prisma.workspace.upsert({
    where: { workspace_slug: 'sineva-hq' },
    create: {
      workspace_slug: 'sineva-hq',
      workspace_name: 'Sineva HQ',
      owner_user_id: user1.id,
      status: 'active',
      default_locale: 'id',
      timezone: 'Asia/Jakarta',
    },
    update: {
      workspace_name: 'Sineva HQ',
      owner_user_id: user1.id,
      status: 'active',
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspace_id_user_id: {
        workspace_id: ws1.id,
        user_id: user1.id,
      },
    },
    create: {
      workspace_id: ws1.id,
      user_id: user1.id,
      role: 'owner',
      specialist_scope: 'all',
      job_title: 'Founding Engineer',
      department: 'Engineering',
    },
    update: {
      role: 'owner',
      specialist_scope: 'all',
    },
  });

  // Seed credential account for admin@sineva.ai (Password: Password123!)
  const salt1 = crypto.randomBytes(16);
  const derivedKey1 = crypto.scryptSync('Password123!', salt1, 64);
  const hash1 = `scrypt:${salt1.toString('hex')}:${derivedKey1.toString('hex')}`;

  await prisma.account.upsert({
    where: {
      provider_id_account_id: {
        provider_id: 'credential',
        account_id: user1.id,
      },
    },
    create: {
      user_id: user1.id,
      provider_id: 'credential',
      account_id: user1.id,
      provider_email: user1.email,
      password: hash1,
    },
    update: {
      password: hash1,
    },
  });

  // Tenant 2: Acme Corp
  const user2 = await prisma.user.upsert({
    where: { email: 'owner@acme.com' },
    create: {
      email: 'owner@acme.com',
      full_name: 'Budi Santoso',
      preferred_name: 'Budi',
      locale: 'id',
      timezone: 'Asia/Jakarta',
      status: 'active',
      email_verified: true,
      email_verified_at: new Date('2026-10-01T08:00:00.000Z'),
    },
    update: {
      full_name: 'Budi Santoso',
      status: 'active',
    },
  });

  const ws2 = await prisma.workspace.upsert({
    where: { workspace_slug: 'acme-corp' },
    create: {
      workspace_slug: 'acme-corp',
      workspace_name: 'Acme Corporation',
      owner_user_id: user2.id,
      status: 'active',
      default_locale: 'id',
      timezone: 'Asia/Jakarta',
    },
    update: {
      workspace_name: 'Acme Corporation',
      owner_user_id: user2.id,
      status: 'active',
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspace_id_user_id: {
        workspace_id: ws2.id,
        user_id: user2.id,
      },
    },
    create: {
      workspace_id: ws2.id,
      user_id: user2.id,
      role: 'owner',
      specialist_scope: 'all',
      job_title: 'Managing Director',
      department: 'Operations',
    },
    update: {
      role: 'owner',
      specialist_scope: 'all',
    },
  });

  // Seed credential account for owner@acme.com (Password: Password123!)
  const salt2 = crypto.randomBytes(16);
  const derivedKey2 = crypto.scryptSync('Password123!', salt2, 64);
  const hash2 = `scrypt:${salt2.toString('hex')}:${derivedKey2.toString('hex')}`;

  await prisma.account.upsert({
    where: {
      provider_id_account_id: {
        provider_id: 'credential',
        account_id: user2.id,
      },
    },
    create: {
      user_id: user2.id,
      provider_id: 'credential',
      account_id: user2.id,
      provider_email: user2.email,
      password: hash2,
    },
    update: {
      password: hash2,
    },
  });

  console.log('Seeded 2 test tenants (sineva-hq, acme-corp) with owners');
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed the database');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    await seedTenants(prisma);
    // No specialist rows: the roster is sineva-ai's catalog presented through the
    // static manifest in `src/shared/specialists/manifest.ts` (ADR-0024).
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
