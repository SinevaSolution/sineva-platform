import { afterAll, beforeEach } from 'vitest';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';

// Own client rather than one shared with the test files: setup files run in
// the same worker but must not depend on what a test file chooses to build.
const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);

async function truncatePlatformTables(): Promise<void> {
  // One statement: Postgres truncates the listed tables atomically, and
  // CASCADE covers any dependent table that is not listed.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "platform"."messages", "platform"."conversations", ' +
      '"platform"."storage_objects", "platform"."agent_configs", ' +
      '"platform"."workspace_member_specialists", "platform"."workspace_members", ' +
      '"platform"."workspace_invitations", "platform"."sessions", "platform"."accounts", ' +
      '"platform"."verifications", "platform"."platform_staff", "platform"."auth_login_attempts", ' +
      '"platform"."workspaces", "platform"."users" CASCADE',
  );
}

beforeEach(truncatePlatformTables);

afterAll(async () => {
  // Leave the database empty so rows from the last test do not leak into
  // whatever uses this database next.
  await truncatePlatformTables();
  await prisma.$disconnect();
});
