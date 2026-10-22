import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError } from '@/server/domain/errors/domain_error';
import { CountingAuditLogger, type AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';
import { PrismaBusinessProfileRepository } from '@/server/infrastructure/database/prisma_business_profile_repository';
import {
  PrismaChecklistRepository,
  PrismaInvitationReader,
  PrismaOnboardingStateRepository,
  PrismaProfileScanRepository,
} from '@/server/infrastructure/database/prisma_onboarding_repositories';
import { PrismaTransactionRunner } from '@/server/infrastructure/database/prisma_transaction_runner';
import { PrismaAuditRepository } from '@/server/infrastructure/database/prisma_audit_repository';
import { RepositoryAuditLogger } from '@/server/application/audit/repository_audit_logger';
import { BusinessProfileWriter } from '@/server/application/use-cases/business-profile/profile_writer';
import { SaveBusinessProfileUseCase } from '@/server/application/use-cases/business-profile/save_business_profile_use_case';
import { RestoreProfileVersionUseCase } from '@/server/application/use-cases/business-profile/restore_profile_version_use_case';
import { CreateOfferingUseCase } from '@/server/application/use-cases/business-profile/create_offering_use_case';

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
const repo = new PrismaBusinessProfileRepository(prisma);
const scans = new PrismaProfileScanRepository(prisma);
const states = new PrismaOnboardingStateRepository(prisma);
const checklist = new PrismaChecklistRepository(prisma);
const invitations = new PrismaInvitationReader(prisma);
const transactions = new PrismaTransactionRunner(prisma);

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

function ctx(workspaceId: string, userId: string): RequestContext {
  return { user_id: userId, workspace_id: workspaceId, role: 'owner', session_id: 's', request_id: 'r' };
}

const HOUR = 60 * 60 * 1000;

describe('business profile tables (WP-M1-35)', () => {
  it('has no row until the first save and ensureProfile is idempotent', async () => {
    const user = await createUser('bp-a@example.com');
    const ws = await createWorkspace('bp-a');
    expect((await repo.load(ws.id)).profile).toBeNull();
    const first = await repo.ensureProfile(ws.id, user.id);
    const second = await repo.ensureProfile(ws.id, user.id);
    expect(second.id).toBe(first.id);
    expect(first.version).toBe(0);
    expect(await prisma.businessProfile.count({ where: { workspace_id: ws.id } })).toBe(1);
  });

  it('round-trips text, jsonb values and a cleared field (null is SQL NULL, not JSON null)', async () => {
    const user = await createUser('bp-b@example.com');
    const ws = await createWorkspace('bp-b');
    await repo.updateProfile(
      ws.id,
      {
        fields: {
          display_name: 'Toko Kopi',
          languages: ['id', 'en'],
          brand_voice: { formality: 'casual', samples: ['Halo kak!'] },
          goals: ['create_content'],
        },
        field_meta: { display_name: { source: 'user', confirmed_at: '2026-10-22T10:00:00.000Z' } },
        confirmed_at: '2026-10-22T10:00:00.000Z',
      },
      user.id,
    );
    let profile = (await repo.load(ws.id)).profile!;
    expect(profile.languages).toEqual(['id', 'en']);
    expect(profile.brand_voice).toEqual({ formality: 'casual', samples: ['Halo kak!'] });
    expect(profile.field_meta.display_name?.source).toBe('user');
    expect(profile.confirmed_at).toBe('2026-10-22T10:00:00.000Z');

    await repo.updateProfile(ws.id, { fields: { brand_voice: null, languages: null }, field_meta: {} }, user.id);
    profile = (await repo.load(ws.id)).profile!;
    expect(profile.brand_voice).toBeNull();
    expect(profile.languages).toBeNull();
    expect(profile.display_name).toBe('Toko Kopi');
    const raw = await prisma.$queryRaw<Array<{ is_null: boolean }>>`
      SELECT brand_voice IS NULL AS is_null FROM platform.business_profiles WHERE workspace_id = ${ws.id}::uuid`;
    expect(raw[0].is_null).toBe(true);
  });

  it('bumpVersion moves exactly one step and refuses a stale expectation', async () => {
    const user = await createUser('bp-c@example.com');
    const ws = await createWorkspace('bp-c');
    await repo.ensureProfile(ws.id, user.id);
    expect(await repo.bumpVersion(ws.id, 0, user.id)).toBe(1);
    await expect(repo.bumpVersion(ws.id, 0, user.id)).rejects.toThrow(ConflictError);
    expect((await repo.load(ws.id)).profile?.version).toBe(1);
  });

  it('two writers racing for the same version: one wins, the other gets a conflict', async () => {
    const user = await createUser('bp-d@example.com');
    const ws = await createWorkspace('bp-d');
    await repo.ensureProfile(ws.id, user.id);
    const results = await Promise.allSettled([
      repo.bumpVersion(ws.id, 0, user.id),
      repo.bumpVersion(ws.id, 0, user.id),
      repo.bumpVersion(ws.id, 0, user.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2);
  });

  it('keeps one row per workspace and version, newest first, and never leaks across workspaces', async () => {
    const user = await createUser('bp-e@example.com');
    const a = await createWorkspace('bp-e1');
    const b = await createWorkspace('bp-e2');
    const snapshot = { fields: {} as never, field_meta: {}, confirmed_at: null, offerings: [], policies: [] };
    for (const version of [1, 2, 3]) {
      await repo.insertVersion({
        workspace_id: a.id, version, snapshot, changed_paths: ['fields.city'], change_kind: 'save', restored_from: null, changed_by: user.id,
      });
    }
    await expect(
      repo.insertVersion({
        workspace_id: a.id, version: 2, snapshot, changed_paths: [], change_kind: 'save', restored_from: null, changed_by: user.id,
      }),
    ).rejects.toThrow(ConflictError);
    expect((await repo.listVersions(a.id, 10)).map((v) => v.version)).toEqual([3, 2, 1]);
    expect((await repo.listVersions(a.id, 10, 3)).map((v) => v.version)).toEqual([2, 1]);
    expect((await repo.listVersions(a.id, 1)).map((v) => v.version)).toEqual([3]);
    expect(await repo.listVersions(b.id, 10)).toEqual([]);
    expect(await repo.getVersion(b.id, 1)).toBeNull();
    expect((await repo.getVersion(a.id, 1))?.changed_by).toBe(user.id);
  });

  it('stores an offering price as integer IDR in a bigint column and scopes updates to the workspace', async () => {
    const user = await createUser('bp-f@example.com');
    const a = await createWorkspace('bp-f1');
    const b = await createWorkspace('bp-f2');
    await repo.ensureProfile(a.id, user.id);
    const offering = await repo.createOffering(a.id, {
      name: 'Kopi', description: null, price_amount: 85000, price_currency: 'IDR', url: null, source: 'user', confirmed_at: '2026-10-22T10:00:00.000Z',
    });
    expect(offering.price_amount).toBe(85000);
    const column = await prisma.$queryRaw<Array<{ data_type: string }>>`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'platform' AND table_name = 'business_offerings' AND column_name = 'price_amount'`;
    expect(column[0].data_type).toBe('bigint');

    expect(await repo.updateOffering(b.id, offering.id, { name: 'Hijack' })).toBeNull();
    expect(await repo.deleteOffering(b.id, offering.id)).toBe(false);
    expect((await repo.load(a.id)).offerings[0].name).toBe('Kopi');
    const second = await repo.createOffering(a.id, {
      name: 'Dripper', description: null, price_amount: null, price_currency: 'IDR', url: null, source: 'scan', confirmed_at: null,
    });
    expect(second.position).toBe(1);
    expect(second.price_amount).toBeNull();
    expect(await repo.countOfferings(a.id)).toBe(2);
  });

  it('replaceContents swaps fields, offers and policies for the snapshot', async () => {
    const user = await createUser('bp-g@example.com');
    const ws = await createWorkspace('bp-g');
    await repo.ensureProfile(ws.id, user.id);
    await repo.createOffering(ws.id, { name: 'Old', description: null, price_amount: 1000, price_currency: 'IDR', url: null, source: 'user', confirmed_at: null });
    await repo.createPolicy(ws.id, { kind: 'faq', title: 'Old', body: 'Old', source: 'user', confirmed_at: null, updated_by: user.id });
    await repo.replaceContents(
      ws.id,
      {
        fields: { display_name: 'Restored', city: null, languages: ['id'] } as never,
        field_meta: { display_name: { source: 'user', confirmed_at: '2026-10-22T10:00:00.000Z' } },
        confirmed_at: '2026-10-22T10:00:00.000Z',
        offerings: [{ name: 'Kopi', description: null, price_amount: 85000, price_currency: 'IDR', url: null, position: 0, source: 'user', confirmed_at: '2026-10-22T10:00:00.000Z' }],
        policies: [{ kind: 'returns', title: 'Returns', body: '7 days', source: 'user', confirmed_at: '2026-10-22T10:00:00.000Z', updated_by: user.id }],
      },
      user.id,
    );
    const loaded = await repo.load(ws.id);
    expect(loaded.profile?.display_name).toBe('Restored');
    expect(loaded.offerings.map((o) => [o.name, o.price_amount])).toEqual([['Kopi', 85000]]);
    expect(loaded.policies.map((p) => p.kind)).toEqual(['returns']);
  });

  it('is removed with the workspace (cascade) for every business table', async () => {
    const user = await createUser('bp-h@example.com');
    const ws = await createWorkspace('bp-h');
    await repo.ensureProfile(ws.id, user.id);
    await repo.createOffering(ws.id, { name: 'X', description: null, price_amount: null, price_currency: 'IDR', url: null, source: 'user', confirmed_at: null });
    await repo.createPolicy(ws.id, { kind: 'faq', title: 'T', body: 'B', source: 'user', confirmed_at: null, updated_by: user.id });
    await states.create({ workspace_id: ws.id, user_id: user.id, flow: 'owner', current_step: 1, answers: {}, skipped_steps: [] });
    await checklist.markDone(ws.id, 'confirm_profile', 'test');
    await prisma.workspace.delete({ where: { id: ws.id } });
    expect(await prisma.businessProfile.count({ where: { workspace_id: ws.id } })).toBe(0);
    expect(await prisma.businessOffering.count({ where: { workspace_id: ws.id } })).toBe(0);
    expect(await prisma.businessPolicy.count({ where: { workspace_id: ws.id } })).toBe(0);
    expect(await prisma.onboardingState.count({ where: { workspace_id: ws.id } })).toBe(0);
    expect(await prisma.workspaceChecklistState.count({ where: { workspace_id: ws.id } })).toBe(0);
  });
});

describe('profile writer on Postgres: one transaction for change, version and audit (FR-ONB-18)', () => {
  function build(audit: AuditLogger) {
    const writer = new BusinessProfileWriter(repo, audit, transactions);
    const now = () => new Date('2026-10-22T10:00:00.000Z');
    return {
      writer,
      save: new SaveBusinessProfileUseCase({ writer, scans, now }),
      restore: new RestoreProfileVersionUseCase({ writer, repo }),
      offering: new CreateOfferingUseCase({ writer, repo, now }),
    };
  }

  it('writes the profile, the version and the audit row together, with no values in the audit row', async () => {
    const user = await createUser('wr-a@example.com');
    const ws = await createWorkspace('wr-a');
    const audit = new RepositoryAuditLogger(new PrismaAuditRepository(prisma));
    const { save } = build(audit);

    const result = await save.execute({
      workspace_id: ws.id, user_id: user.id, input: { display_name: 'Secret Name Shop' }, context: ctx(ws.id, user.id),
    });
    expect(result.version).toBe(1);
    expect(await prisma.businessProfileVersion.count({ where: { workspace_id: ws.id } })).toBe(1);
    const events = await prisma.auditEvent.findMany({ where: { workspace_id: ws.id, action: 'profile.updated' } });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0])).not.toContain('Secret Name Shop');
  });

  it('rolls everything back when the audit write fails: no profile row, no version', async () => {
    const user = await createUser('wr-b@example.com');
    const ws = await createWorkspace('wr-b');
    const failing: AuditLogger = { log: async () => { throw new Error('audit down'); } };
    const { save } = build(failing);

    await expect(
      save.execute({ workspace_id: ws.id, user_id: user.id, input: { display_name: 'X' }, context: ctx(ws.id, user.id) }),
    ).rejects.toThrow('audit down');
    expect(await prisma.businessProfile.count({ where: { workspace_id: ws.id } })).toBe(0);
    expect(await prisma.businessProfileVersion.count({ where: { workspace_id: ws.id } })).toBe(0);
  });

  it('refuses a save from a stale base_version and keeps the newer data', async () => {
    const user = await createUser('wr-c@example.com');
    const ws = await createWorkspace('wr-c');
    const { save } = build(new CountingAuditLogger());
    const run = (input: Record<string, unknown>) =>
      save.execute({ workspace_id: ws.id, user_id: user.id, input, context: ctx(ws.id, user.id) });
    await run({ display_name: 'A' });
    await run({ display_name: 'B' });
    await expect(run({ display_name: 'C', base_version: 1 })).rejects.toThrow(ConflictError);
    expect((await repo.load(ws.id)).profile?.display_name).toBe('B');
  });

  it('restore writes a new version with the old content, offers included', async () => {
    const user = await createUser('wr-d@example.com');
    const ws = await createWorkspace('wr-d');
    const { save, restore, offering } = build(new CountingAuditLogger());
    await save.execute({ workspace_id: ws.id, user_id: user.id, input: { display_name: 'A' }, context: ctx(ws.id, user.id) });
    await offering.execute({ workspace_id: ws.id, user_id: user.id, input: { name: 'Kopi', price_amount: 85000 }, context: ctx(ws.id, user.id) });
    await save.execute({ workspace_id: ws.id, user_id: user.id, input: { display_name: 'B' }, context: ctx(ws.id, user.id) });
    const result = await restore.execute({ workspace_id: ws.id, user_id: user.id, version: 2, context: ctx(ws.id, user.id) });
    expect(result.version).toBe(4);
    const loaded = await repo.load(ws.id);
    expect(loaded.profile?.display_name).toBe('A');
    expect(loaded.offerings.map((o) => [o.name, o.price_amount])).toEqual([['Kopi', 85000]]);
    expect((await repo.listVersions(ws.id, 10)).map((v) => [v.version, v.change_kind, v.restored_from])).toEqual([
      [4, 'restore', 2],
      [3, 'save', null],
      [2, 'save', null],
      [1, 'save', null],
    ]);
  });
});

describe('profile scans (WP-M1-36, FR-ONB-12)', () => {
  const base = { limit: 5, window_ms: HOUR, ttl_ms: 24 * HOUR };

  it('creates running rows with a 24 hour expiry', async () => {
    const user = await createUser('sc-a@example.com');
    const ws = await createWorkspace('sc-a');
    const now = new Date('2026-10-22T10:00:00.000Z');
    const outcome = await scans.createIfUnderLimit({ ...base, workspace_id: ws.id, requested_by: user.id, url: 'https://a.example/', now });
    if (outcome.limited) throw new Error('unexpected');
    expect(outcome.scan).toMatchObject({ status: 'running', result: null, workspace_id: ws.id });
    expect(outcome.scan.expires_at).toBe(new Date(now.getTime() + 24 * HOUR).toISOString());
  });

  it('allows five and limits the sixth with a retry time, per workspace', async () => {
    const user = await createUser('sc-b@example.com');
    const a = await createWorkspace('sc-b1');
    const b = await createWorkspace('sc-b2');
    const now = new Date();
    for (let i = 0; i < 5; i += 1) {
      const o = await scans.createIfUnderLimit({ ...base, workspace_id: a.id, requested_by: user.id, url: 'https://a.example/', now });
      expect(o.limited).toBe(false);
    }
    const sixth = await scans.createIfUnderLimit({ ...base, workspace_id: a.id, requested_by: user.id, url: 'https://a.example/', now });
    expect(sixth.limited).toBe(true);
    if (sixth.limited) expect(sixth.retry_after_seconds).toBeGreaterThan(3500);
    expect((await scans.createIfUnderLimit({ ...base, workspace_id: b.id, requested_by: user.id, url: 'https://b.example/', now })).limited).toBe(false);
  });

  it('concurrent requests cannot overshoot the limit (advisory lock)', async () => {
    const user = await createUser('sc-c@example.com');
    const ws = await createWorkspace('sc-c');
    const now = new Date();
    const outcomes = await Promise.all(
      Array.from({ length: 12 }, () =>
        scans.createIfUnderLimit({ ...base, workspace_id: ws.id, requested_by: user.id, url: 'https://c.example/', now }),
      ),
    );
    expect(outcomes.filter((o) => !o.limited)).toHaveLength(5);
    expect(await prisma.profileScan.count({ where: { workspace_id: ws.id } })).toBe(5);
  });

  it('counts deleted rows but not scans that never reached sineva-ai', async () => {
    const user = await createUser('sc-d@example.com');
    const ws = await createWorkspace('sc-d');
    const now = new Date();
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const o = await scans.createIfUnderLimit({ ...base, workspace_id: ws.id, requested_by: user.id, url: 'https://d.example/', now });
      if (o.limited) throw new Error('unexpected');
      ids.push(o.scan.id);
    }
    for (const id of ids) await scans.discard(ws.id, id);
    expect((await scans.createIfUnderLimit({ ...base, workspace_id: ws.id, requested_by: user.id, url: 'https://d.example/', now })).limited).toBe(true);

    // Mark two of the five as never having reached the fetcher: two slots free up.
    await prisma.profileScan.updateMany({ where: { id: { in: ids.slice(0, 2) } }, data: { error_code: 'ai_engine_unavailable' } });
    expect((await scans.createIfUnderLimit({ ...base, workspace_id: ws.id, requested_by: user.id, url: 'https://d.example/', now })).limited).toBe(false);
  });

  it('lets the window slide: rows older than an hour no longer count', async () => {
    const user = await createUser('sc-e@example.com');
    const ws = await createWorkspace('sc-e');
    const start = new Date('2026-10-22T10:00:00.000Z');
    for (let i = 0; i < 5; i += 1) {
      await scans.createIfUnderLimit({ ...base, workspace_id: ws.id, requested_by: user.id, url: 'https://e.example/', now: start });
    }
    const later = new Date(start.getTime() + HOUR + 1000);
    expect((await scans.createIfUnderLimit({ ...base, workspace_id: ws.id, requested_by: user.id, url: 'https://e.example/', now: later })).limited).toBe(false);
  });

  it('records an outcome with its result, hides rows of other workspaces and drops the result on discard', async () => {
    const user = await createUser('sc-f@example.com');
    const a = await createWorkspace('sc-f1');
    const b = await createWorkspace('sc-f2');
    const now = new Date();
    const o = await scans.createIfUnderLimit({ ...base, workspace_id: a.id, requested_by: user.id, url: 'https://f.example/', now });
    if (o.limited) throw new Error('unexpected');
    const result = {
      scan_id: o.scan.id, status: 'succeeded', source_url: 'https://f.example/', final_url: null, fetched_pages: 1, site_language: 'id',
      fields: {}, offers: [], policies: [], error_code: null,
    } as never;
    const recorded = await scans.recordOutcome(a.id, o.scan.id, { status: 'succeeded', result, error_code: null });
    expect(recorded?.status).toBe('succeeded');
    expect(recorded?.result).toMatchObject({ fetched_pages: 1 });

    expect(await scans.findById(b.id, o.scan.id)).toBeNull();
    expect(await scans.recordOutcome(b.id, o.scan.id, { status: 'failed', result: null, error_code: 'x' })).toBeNull();
    expect(await scans.discard(b.id, o.scan.id)).toBe(false);

    expect(await scans.discard(a.id, o.scan.id)).toBe(true);
    expect(await scans.findById(a.id, o.scan.id)).toBeNull();
    expect(await scans.recordOutcome(a.id, o.scan.id, { status: 'succeeded', result, error_code: null })).toBeNull();
    const row = await prisma.profileScan.findUniqueOrThrow({ where: { id: o.scan.id } });
    expect(row.result).toBeNull();
    expect(row.deleted_at).not.toBeNull();
  });

  it('purges the result of expired rows of that workspace only', async () => {
    const user = await createUser('sc-g@example.com');
    const a = await createWorkspace('sc-g1');
    const b = await createWorkspace('sc-g2');
    const past = new Date(Date.now() - 25 * HOUR);
    const result = { scan_id: 'x', status: 'succeeded', fields: {}, offers: [], policies: [] } as never;
    for (const ws of [a, b]) {
      const o = await scans.createIfUnderLimit({ ...base, workspace_id: ws.id, requested_by: user.id, url: 'https://g.example/', now: past });
      if (o.limited) throw new Error('unexpected');
      await scans.recordOutcome(ws.id, o.scan.id, { status: 'succeeded', result, error_code: null });
    }
    expect(await scans.purgeExpired(a.id, new Date())).toBe(1);
    expect((await prisma.profileScan.findFirstOrThrow({ where: { workspace_id: a.id } })).result).toBeNull();
    expect((await prisma.profileScan.findFirstOrThrow({ where: { workspace_id: b.id } })).result).not.toBeNull();
  });
});

describe('onboarding state, checklist and invitations (WP-M1-36)', () => {
  it('keeps one resumable row per workspace and member', async () => {
    const owner = await createUser('on-a@example.com');
    const member = await createUser('on-b@example.com');
    const ws = await createWorkspace('on-a');
    await states.create({ workspace_id: ws.id, user_id: owner.id, flow: 'owner', current_step: 1, answers: {}, skipped_steps: [] });
    await expect(
      states.create({ workspace_id: ws.id, user_id: owner.id, flow: 'owner', current_step: 1, answers: {}, skipped_steps: [] }),
    ).rejects.toThrow(ConflictError);
    await states.create({ workspace_id: ws.id, user_id: member.id, flow: 'member', current_step: 1, answers: {}, skipped_steps: [] });

    const updated = await states.update(ws.id, owner.id, {
      current_step: 3,
      answers: { language: 'id', business_name: 'Toko Kopi' },
      skipped_steps: [3],
      dismissed_tasks: [{ task_id: 'generic_social_week', dismissed_at: '2026-10-22T10:00:00.000Z' }],
    });
    expect(updated).toMatchObject({ current_step: 3, skipped_steps: [3], persisted: true });
    const resumed = await states.find(ws.id, owner.id);
    expect(resumed?.answers).toEqual({ language: 'id', business_name: 'Toko Kopi' });
    expect(resumed?.dismissed_tasks).toHaveLength(1);
    expect((await states.find(ws.id, member.id))?.answers).toEqual({});
    expect(await states.find(ws.id, 'ffffffff-ffff-4fff-8fff-ffffffffffff')).toBeNull();

    const done = await states.update(ws.id, owner.id, { status: 'completed', completed_at: '2026-10-22T11:00:00.000Z' });
    expect(done.status).toBe('completed');
    expect(done.completed_at).toBe('2026-10-22T11:00:00.000Z');
  });

  it('records a checklist item once and keeps the first completion time', async () => {
    const ws = await createWorkspace('on-c');
    await checklist.markDone(ws.id, 'confirm_profile', 'first');
    const first = (await checklist.listDone(ws.id))[0].completed_at;
    await checklist.markDone(ws.id, 'confirm_profile', 'second');
    const rows = await checklist.listDone(ws.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].completed_at).toBe(first);
    expect(await prisma.workspaceChecklistState.count({ where: { workspace_id: ws.id } })).toBe(1);
  });

  it('reads pending and accepted invitations', async () => {
    const inviter = await createUser('on-d@example.com');
    const ws = await createWorkspace('on-d');
    const now = new Date('2026-10-22T10:00:00.000Z');
    expect(await invitations.hasPendingForEmail('guest@example.com', now)).toBe(false);

    await prisma.workspaceInvitation.create({
      data: {
        workspace_id: ws.id, email: 'Guest@Example.com', inviter_user_id: inviter.id, token_hash: 'hash-1',
        expires_at: new Date(now.getTime() + HOUR),
      },
    });
    expect(await invitations.hasPendingForEmail('guest@example.com', now)).toBe(true);
    expect(await invitations.hasPendingForEmail('guest@example.com', new Date(now.getTime() + 2 * HOUR))).toBe(false);
    expect(await invitations.hasAcceptedInvitation(ws.id)).toBe(false);

    await prisma.workspaceInvitation.update({ where: { token_hash: 'hash-1' }, data: { accepted_at: now } });
    expect(await invitations.hasPendingForEmail('guest@example.com', now)).toBe(false);
    expect(await invitations.hasAcceptedInvitation(ws.id)).toBe(true);
  });
});
