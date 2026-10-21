import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError } from '@/server/domain/errors/domain_error';
import type { CreateAgentInput } from '@/server/domain/repositories/agent_repository';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';
import { PrismaAgentRepository } from '@/server/infrastructure/database/prisma_agent_repository';

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
const repository = new PrismaAgentRepository(prisma);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type RowOverrides = Partial<
  Parameters<typeof prisma.agentConfig.create>[0]['data']
>;

// Inserted straight through Prisma (not through the repository under test) so
// reads are verified against rows the adapter did not shape itself.
let rowCounter = 0;
async function insertAgentRow(overrides: RowOverrides = {}) {
  rowCounter += 1;
  return prisma.agentConfig.create({
    data: {
      agent_slug: `agent-${rowCounter}`,
      display_name: `Agent ${rowCounter}`,
      role_title: 'Tester',
      category: 'data_insights',
      short_description: 'Row inserted by the integration test.',
      capabilities: ['one', 'two'],
      // Distinct, increasing timestamps give findAll a deterministic order.
      created_at: new Date(Date.UTC(2026, 9, 1, 8, rowCounter)),
      updated_at: new Date(Date.UTC(2026, 9, 1, 9, rowCounter)),
      ...overrides,
    },
  });
}

function buildCreateInput(
  overrides: Partial<CreateAgentInput> = {},
): CreateAgentInput {
  return {
    agent_slug: 'sinocompliance',
    display_name: 'SinoCompliance',
    role_title: 'SOC2 & ISO27001 Auditor',
    category: 'finance_ops',
    short_description: 'Continuously monitors cloud controls.',
    capabilities: ['soc2_evidence_collection', 'vendor_risk_matrix'],
    model_name: 'sineva-core-v2',
    ...overrides,
  };
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PrismaAgentRepository', () => {
  describe('findAll', () => {
    it('returns an empty page and zero total when nothing is stored', async () => {
      await expect(
        repository.findAll({ page: 1, per_page: 10 }),
      ).resolves.toEqual({ items: [], total_items: 0 });
    });

    it('paginates in creation order and reports the unpaginated total', async () => {
      for (let i = 0; i < 5; i += 1) {
        await insertAgentRow();
      }

      const first = await repository.findAll({ page: 1, per_page: 2 });
      const second = await repository.findAll({ page: 2, per_page: 2 });
      const last = await repository.findAll({ page: 3, per_page: 2 });

      expect(first.total_items).toBe(5);
      expect(first.items.map((a) => a.agent_slug)).toEqual([
        'agent-1',
        'agent-2',
      ]);
      expect(second.items.map((a) => a.agent_slug)).toEqual([
        'agent-3',
        'agent-4',
      ]);
      expect(last.items.map((a) => a.agent_slug)).toEqual(['agent-5']);
    });

    it('filters by category and counts only the filtered rows', async () => {
      await insertAgentRow({ category: 'people_hr' });
      await insertAgentRow({ category: 'finance_ops' });
      await insertAgentRow({ category: 'people_hr' });

      const result = await repository.findAll({
        page: 1,
        per_page: 10,
        category_filter: 'people_hr',
      });

      expect(result.total_items).toBe(2);
      expect(result.items.every((a) => a.category === 'people_hr')).toBe(true);
    });
  });

  describe('findBySlug', () => {
    it('maps a stored row to a domain entity', async () => {
      const row = await insertAgentRow({
        agent_slug: 'sinopeople',
        status: 'standby',
        avg_latency_ms: 340,
        active_sessions_count: 18,
        daily_tokens_used: 142800,
        accent_token: '--teal-700',
      });

      const entity = await repository.findBySlug('sinopeople');

      expect(entity).toEqual({
        id: row.id,
        agent_slug: 'sinopeople',
        display_name: row.display_name,
        role_title: 'Tester',
        category: 'data_insights',
        status: 'standby',
        short_description: 'Row inserted by the integration test.',
        capabilities: ['one', 'two'],
        model_name: 'sineva-core-v2',
        avg_latency_ms: 340,
        active_sessions_count: 18,
        daily_tokens_used: 142800,
        accent_token: '--teal-700',
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      });
      expect(entity?.id).toMatch(UUID_PATTERN);
      expect(typeof entity?.created_at).toBe('string');
    });

    it('returns null for an unknown slug', async () => {
      await expect(repository.findBySlug('does-not-exist')).resolves.toBeNull();
    });
  });

  describe('create', () => {
    it('persists the agent with the in-memory repository default values', async () => {
      const created = await repository.create(buildCreateInput());

      expect(created).toMatchObject({
        agent_slug: 'sinocompliance',
        display_name: 'SinoCompliance',
        category: 'finance_ops',
        status: 'online',
        capabilities: ['soc2_evidence_collection', 'vendor_risk_matrix'],
        model_name: 'sineva-core-v2',
        avg_latency_ms: 350,
        active_sessions_count: 1,
        daily_tokens_used: 0,
        accent_token: '--teal-500',
      });
      expect(created.id).toMatch(UUID_PATTERN);
      expect(Number.isNaN(Date.parse(created.created_at))).toBe(false);

      await expect(repository.findBySlug('sinocompliance')).resolves.toEqual(
        created,
      );
    });

    it('throws ConflictError (409) when the slug already exists', async () => {
      await repository.create(buildCreateInput());

      const attempt = repository.create(
        buildCreateInput({ display_name: 'Impostor' }),
      );

      await expect(attempt).rejects.toBeInstanceOf(ConflictError);
      await expect(attempt).rejects.toMatchObject({
        status: 409,
        code: 'RESOURCE_CONFLICT',
      });
      // The original row is untouched.
      const stored = await repository.findBySlug('sinocompliance');
      expect(stored?.display_name).toBe('SinoCompliance');
    });
  });

  describe('row validation', () => {
    it('throws instead of casting when the stored category is unknown', async () => {
      await insertAgentRow({ agent_slug: 'bad-category', category: 'wizardry' });

      await expect(repository.findBySlug('bad-category')).rejects.toThrow(
        /category.*wizardry/i,
      );
    });

    it('throws instead of casting when the stored status is unknown', async () => {
      await insertAgentRow({ agent_slug: 'bad-status', status: 'on_fire' });

      await expect(repository.findBySlug('bad-status')).rejects.toThrow(
        /status.*on_fire/i,
      );
    });

    it('throws when stored capabilities are not an array of strings', async () => {
      await insertAgentRow({
        agent_slug: 'bad-capabilities',
        capabilities: { not: 'an array' },
      });
      await insertAgentRow({
        agent_slug: 'mixed-capabilities',
        capabilities: ['ok', 42],
      });

      await expect(repository.findBySlug('bad-capabilities')).rejects.toThrow(
        /capabilities/i,
      );
      await expect(repository.findBySlug('mixed-capabilities')).rejects.toThrow(
        /capabilities/i,
      );
    });

    it('fails findAll as a whole if any row on the page is invalid', async () => {
      await insertAgentRow();
      await insertAgentRow({ category: 'wizardry' });

      await expect(
        repository.findAll({ page: 1, per_page: 10 }),
      ).rejects.toThrow(/category/i);
    });
  });
});
