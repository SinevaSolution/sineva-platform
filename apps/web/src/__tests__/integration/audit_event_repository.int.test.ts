import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RepositoryAuditLogger } from '@/server/application/audit/repository_audit_logger';
import { CreateWorkspaceUseCase } from '@/server/application/use-cases/workspace/create_workspace_use_case';
import { RotateSigningKeyUseCase } from '@/server/application/use-cases/security/rotate_signing_key_use_case';
import { buildAuditRecord } from '@/server/domain/audit/audit_event';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';
import { PrismaAuditRepository } from '@/server/infrastructure/database/prisma_audit_repository';
import { PrismaSigningKeyRepository } from '@/server/infrastructure/database/prisma_signing_key_repository';
import { PrismaTransactionRunner } from '@/server/infrastructure/database/prisma_transaction_runner';
import { PrismaWorkspaceRepository } from '@/server/infrastructure/database/prisma_workspace_repository';

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
const auditRepo = new PrismaAuditRepository(prisma);
const transactions = new PrismaTransactionRunner(prisma);

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const WS_A = '11111111-1111-4111-8111-111111111111';
const WS_B = '22222222-2222-4222-8222-222222222222';

function record(workspaceId: string | null, action = 'workspace.updated') {
  return buildAuditRecord({
    action,
    context: {
      user_id: 'usr-1',
      session_id: 's',
      request_id: 'req-1',
      actor: { type: 'user', id: 'usr-1' },
      ip: '203.0.113.77',
    },
    workspace_id: workspaceId ?? undefined,
    target_resource_type: 'workspace',
    target_resource_id: WS_A,
    metadata: { updated_fields: ['workspace_name'] },
  });
}

describe('audit_events table (WP-M0-33, FR-SEC-31, FR-SEC-32)', () => {
  it('stores the FR-SEC-32 field set with null hash columns', async () => {
    const saved = await auditRepo.insert(record(WS_A));

    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved).toMatchObject({
      workspace_id: WS_A,
      actor_type: 'user',
      actor_id: 'usr-1',
      action: 'workspace.updated',
      outcome: 'allowed',
      request_id: 'req-1',
      ip: '203.0.113.0',
      metadata: { updated_fields: ['workspace_name'] },
      prev_hash: null,
      hash: null,
    });
    expect(Number.isNaN(Date.parse(saved.occurred_at))).toBe(false);
  });

  it('accepts events without a workspace (sign-in) and still lists them by actor', async () => {
    await auditRepo.insert(record(null, 'user.signed_in'));

    const rows = await prisma.auditEvent.findMany({ where: { workspace_id: null } });
    expect(rows.map((r) => r.action)).toEqual(['user.signed_in']);
  });

  it('select is tenant-scoped: workspace B never sees workspace A rows (canary)', async () => {
    await auditRepo.insert(record(WS_A));
    await auditRepo.insert(record(WS_A, 'workspace.created'));
    await auditRepo.insert(record(WS_B));

    const forB = await auditRepo.select({ workspace_id: WS_B });
    const forA = await auditRepo.select({ workspace_id: WS_A, action: 'workspace.created' });

    expect(forB).toHaveLength(1);
    expect(forB.every((row) => row.workspace_id === WS_B)).toBe(true);
    expect(forA.map((row) => row.action)).toEqual(['workspace.created']);
  });

  it('the database refuses values the writer never produces', async () => {
    await expect(auditRepo.insert({ ...record(WS_A), outcome: 'maybe' as never })).rejects.toThrow();
    await expect(
      auditRepo.insert({ ...record(WS_A), actor_type: 'robot' as never }),
    ).rejects.toThrow();
  });
});

describe('audit write is in the same transaction as the action (FR-SEC data integrity)', () => {
  async function seedOwner(): Promise<string> {
    const user = await prisma.user.create({ data: { email: 'owner@sineva.id', full_name: 'Owner' } });
    return user.id;
  }

  const failingAudit: AuditLogger = {
    // A row the CHECK constraint rejects: the failure comes from the database,
    // inside the transaction, exactly like a real audit write failure.
    log: async (event) => {
      await auditRepo.insert({ ...buildAuditRecord(event), outcome: 'maybe' as never });
    },
  };

  it('commits the workspace and its workspace.created row together', async () => {
    const ownerId = await seedOwner();
    const useCase = new CreateWorkspaceUseCase(
      new PrismaWorkspaceRepository(prisma),
      new RepositoryAuditLogger(auditRepo),
      transactions,
    );

    const workspace = await useCase.execute({
      workspace_name: 'Acme',
      workspace_slug: 'acme',
      owner_user_id: ownerId,
    });

    const rows = await auditRepo.select({ workspace_id: workspace.id });
    expect(rows.map((row) => row.action)).toEqual(['workspace.created']);
    expect(rows[0]).toMatchObject({ actor_type: 'user', actor_id: ownerId, target_id: workspace.id });
  });

  it('rolls the workspace and its owner membership back when the audit write fails', async () => {
    const ownerId = await seedOwner();
    const useCase = new CreateWorkspaceUseCase(
      new PrismaWorkspaceRepository(prisma),
      failingAudit,
      transactions,
    );

    await expect(
      useCase.execute({ workspace_name: 'Ghost', workspace_slug: 'ghost', owner_user_id: ownerId }),
    ).rejects.toThrow();

    expect(await prisma.workspace.count({ where: { workspace_slug: 'ghost' } })).toBe(0);
    expect(await prisma.workspaceMember.count()).toBe(0);
  });

  it('rolls a signing key rotation back when the audit write fails', async () => {
    const keys = new PrismaSigningKeyRepository(prisma);
    const now = new Date();
    const key = (kid: string, status: 'active' | 'next') => ({
      id: crypto.randomUUID(),
      kid,
      alg: 'EdDSA',
      public_key: 'pem',
      status,
      purpose: 'context' as const,
      valid_from: now.toISOString(),
      valid_until: new Date(now.getTime() + 86_400_000).toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
    await keys.save(key('k-old', 'active'));

    await expect(
      new RotateSigningKeyUseCase(keys, failingAudit, transactions).execute({
        new_key: key('k-new', 'next'),
        retire_kid: 'k-old',
      }),
    ).rejects.toThrow();

    expect((await keys.findByKid('k-old'))?.status).toBe('active');
    expect(await keys.findByKid('k-new')).toBeNull();

    await new RotateSigningKeyUseCase(keys, new RepositoryAuditLogger(auditRepo), transactions).execute({
      new_key: key('k-new', 'next'),
      retire_kid: 'k-old',
    });
    expect((await keys.findByKid('k-old'))?.status).toBe('retired');
    expect(
      (await prisma.auditEvent.findMany({ where: { action: 'signing_key.rotated' } })).map(
        (row) => row.target_id,
      ),
    ).toEqual(['k-new']);
  });
});
