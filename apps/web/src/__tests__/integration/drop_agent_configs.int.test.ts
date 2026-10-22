import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);

afterAll(async () => {
  await prisma.$disconnect();
});

// Red before the migration `drop_agent_configs` exists: the table is still there
// (FR-SPEC-06, DOM-3, DOM-4, DOM-6).
describe('agent_configs is dropped (ADR-0024)', () => {
  it('has no agent_configs table in any schema', async () => {
    const rows = await prisma.$queryRaw<Array<{ table_schema: string }>>`
      SELECT table_schema FROM information_schema.tables WHERE table_name = 'agent_configs'
    `;
    expect(rows).toEqual([]);
  });

  it('leaves the other platform tables in place', async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'platform' AND table_name IN ('workspaces', 'conversations', 'chat_runs')
      ORDER BY table_name
    `;
    expect(rows.map((r) => r.table_name)).toEqual(['chat_runs', 'conversations', 'workspaces']);
  });
});
