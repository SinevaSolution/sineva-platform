import { ZodError } from 'zod';
import { beforeEach, describe, expect, it } from 'vitest';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import {
  EntitlementRequiredError,
  type EntitlementService,
} from '@/server/domain/entitlements/entitlements';
import {
  ConflictError,
  DomainError,
  FirstWorkspaceNotAllowedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/server/domain/errors/domain_error';
import { noTransaction } from '@/server/domain/transactions/transaction_runner';
import { CreateWorkspaceUseCase } from '@/server/application/use-cases/workspace/create_workspace_use_case';
import { UpdateWorkspaceUseCase } from '@/server/application/use-cases/workspace/update_workspace_use_case';
import { CreateFirstWorkspaceUseCase } from '@/server/application/use-cases/onboarding/create_first_workspace_use_case';
import { GetOnboardingUseCase } from '@/server/application/use-cases/onboarding/get_onboarding_use_case';
import { UpdateOnboardingUseCase } from '@/server/application/use-cases/onboarding/update_onboarding_use_case';
import { CompleteOnboardingUseCase } from '@/server/application/use-cases/onboarding/complete_onboarding_use_case';
import { GetFirstTasksUseCase } from '@/server/application/use-cases/onboarding/get_first_tasks_use_case';
import { DismissFirstTaskUseCase } from '@/server/application/use-cases/onboarding/dismiss_first_task_use_case';
import { RecordChecklistEventUseCase } from '@/server/application/use-cases/onboarding/record_checklist_event_use_case';
import { BusinessProfileWriter } from '@/server/application/use-cases/business-profile/profile_writer';
import { allowAllEntitlements } from './fakes/allow_all_entitlements';
import { InMemoryBusinessProfileRepository } from './fakes/in_memory_business_profile';
import {
  FakeInvitationReader,
  InMemoryChecklistRepository,
  InMemoryOnboardingStateRepository,
  InMemoryProfileScanRepository,
} from './fakes/in_memory_onboarding';
import { InMemoryWorkspaceRepository } from './fakes/in_memory_workspaces';
import { FakeUserProfileRepository, buildUserProfile } from './fakes/fake_user_profile_repository';

const USER = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-10-22T10:00:00.000Z');

const denyEntitlements: EntitlementService = {
  check: async () => ({ allowed: false, reason: 'limit_exceeded' }),
  assert: async (_ws, key) => {
    throw new EntitlementRequiredError(key);
  },
};

function ctx(
  workspace: string | undefined,
  user = USER,
  role: RequestContext['role'] = 'owner',
): RequestContext {
  return { user_id: user, workspace_id: workspace, role, session_id: 's1', request_id: 'req-1' };
}

describe('onboarding use cases (WP-M1-36, FR-ONB-01 to 08, 12, 13, 21 to 23)', () => {
  let workspaces: InMemoryWorkspaceRepository;
  let states: InMemoryOnboardingStateRepository;
  let checklist: InMemoryChecklistRepository;
  let invitations: FakeInvitationReader;
  let profiles: FakeUserProfileRepository;
  let audit: CountingAuditLogger;
  let profileRepo: InMemoryBusinessProfileRepository;
  let scans: InMemoryProfileScanRepository;
  let createWorkspace: CreateWorkspaceUseCase;
  let updateWorkspace: UpdateWorkspaceUseCase;

  beforeEach(() => {
    workspaces = new InMemoryWorkspaceRepository();
    states = new InMemoryOnboardingStateRepository();
    checklist = new InMemoryChecklistRepository();
    invitations = new FakeInvitationReader();
    profiles = new FakeUserProfileRepository();
    profiles.seed(
      buildUserProfile({
        id: USER,
        email: 'Amira@example.com',
        full_name: 'Amira Putri',
        locale: 'id',
      }),
    );
    profiles.seed(
      buildUserProfile({ id: OTHER, email: 'budi@example.com', full_name: 'Budi', locale: 'en' }),
    );
    audit = new CountingAuditLogger();
    profileRepo = new InMemoryBusinessProfileRepository();
    scans = new InMemoryProfileScanRepository();
    createWorkspace = new CreateWorkspaceUseCase(workspaces, audit, allowAllEntitlements);
    updateWorkspace = new UpdateWorkspaceUseCase(workspaces, audit);
  });

  function firstWorkspace(
    entitlements: EntitlementService = allowAllEntitlements,
    suffix = 'a1b2c3',
  ) {
    return new CreateFirstWorkspaceUseCase({
      workspaces,
      createWorkspace: new CreateWorkspaceUseCase(workspaces, audit, entitlements),
      profiles,
      invitations,
      states,
      audit,
      transactions: noTransaction,
      now: () => NOW,
      newSlugSuffix: () => suffix,
    });
  }

  describe('create my first workspace (FR-ONB-01)', () => {
    it('creates a provisional workspace named in the person language, with an owner state in step 1', async () => {
      const result = await firstWorkspace().execute({ user_id: USER, context: ctx(undefined) });
      expect(result.workspace.workspace_name).toBe('Workspace saya');
      expect(result.workspace.workspace_slug).toBe('workspace-saya-a1b2c3');
      expect(result.workspace.owner_user_id).toBe(USER);
      expect(result.state).toMatchObject({
        flow: 'owner',
        status: 'in_progress',
        current_step: 1,
        persisted: true,
      });
      expect(states.rows.size).toBe(1);
    });

    it('uses English for an English profile', async () => {
      const result = await firstWorkspace().execute({
        user_id: OTHER,
        context: ctx(undefined, OTHER),
      });
      expect(result.workspace.workspace_name).toBe('My workspace');
      expect(result.workspace.workspace_slug).toBe('my-workspace-a1b2c3');
    });

    it('audits workspace.created and onboarding.started', async () => {
      const result = await firstWorkspace().execute({ user_id: USER, context: ctx(undefined) });
      const actions = audit.getEvents().map((e) => e.action);
      expect(actions).toContain('workspace.created');
      expect(actions).toContain('onboarding.started');
      const started = audit.getEvents().find((e) => e.action === 'onboarding.started');
      expect(started?.workspace_id).toBe(result.workspace.id);
    });

    it('refuses when the person already belongs to a workspace, and creates nothing', async () => {
      await createWorkspace.execute({ workspace_name: 'Existing', owner_user_id: USER });
      const before = workspaces.workspaces.size;
      const error = await firstWorkspace()
        .execute({ user_id: USER, context: ctx(undefined) })
        .catch((e) => e);
      expect(error).toBeInstanceOf(FirstWorkspaceNotAllowedError);
      expect(error.reason).toBe('already_has_workspace');
      expect(error.status).toBe(409);
      expect(workspaces.workspaces.size).toBe(before);
      expect(states.rows.size).toBe(0);
    });

    it('refuses a member of someone else workspace too', async () => {
      const ws = await createWorkspace.execute({ workspace_name: 'Boss', owner_user_id: OTHER });
      workspaces.memberOf.set(USER, new Set([ws.id]));
      await expect(
        firstWorkspace().execute({ user_id: USER, context: ctx(undefined) }),
      ).rejects.toThrow(FirstWorkspaceNotAllowedError);
    });

    it('refuses an invited person: they join through the invitation, not a workspace of their own', async () => {
      invitations.pendingEmails.add('amira@example.com');
      const error = await firstWorkspace()
        .execute({ user_id: USER, context: ctx(undefined) })
        .catch((e) => e);
      expect(error).toBeInstanceOf(FirstWorkspaceNotAllowedError);
      expect(error.reason).toBe('invited_user');
      expect(workspaces.workspaces.size).toBe(0);
    });

    it('respects the entitlement seam workspaces.owned.max: a denial leaves nothing behind', async () => {
      await expect(
        firstWorkspace(denyEntitlements).execute({ user_id: USER, context: ctx(undefined) }),
      ).rejects.toThrow(EntitlementRequiredError);
      expect(workspaces.workspaces.size).toBe(0);
      expect(states.rows.size).toBe(0);
    });

    it('needs a verified email (FR-AUTH-03)', async () => {
      profiles.seed(buildUserProfile({ id: USER, email_verified: false }));
      const error = await firstWorkspace()
        .execute({ user_id: USER, context: ctx(undefined) })
        .catch((e) => e);
      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('email_not_verified');
      expect(error.status).toBe(403);
      expect(workspaces.workspaces.size).toBe(0);
    });

    it('is not found for an unknown user', async () => {
      await expect(
        firstWorkspace().execute({ user_id: 'nobody', context: ctx(undefined, 'nobody') }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('onboarding state is saved per step and resumable', () => {
    let ws: string;
    let get: GetOnboardingUseCase;
    let update: UpdateOnboardingUseCase;

    beforeEach(async () => {
      const created = await firstWorkspace().execute({ user_id: USER, context: ctx(undefined) });
      ws = created.workspace.id;
      get = new GetOnboardingUseCase({ states, checklist, invitations });
      update = new UpdateOnboardingUseCase({
        states,
        workspaces,
        updateWorkspace,
        audit,
        transactions: noTransaction,
        now: () => NOW,
        newSlugSuffix: () => 'x9y8',
      });
    });

    const step = (
      n: number,
      action: 'save' | 'skip',
      answers?: Record<string, unknown>,
      role: RequestContext['role'] = 'owner',
      user = USER,
    ) =>
      update.execute({
        workspace_id: ws,
        user_id: user,
        role,
        step: n,
        action,
        answers,
        context: ctx(ws, user, role),
      });

    it('a read never writes: a member with no row sees the default two-screen welcome', async () => {
      const result = await get.execute({ workspace_id: ws, user_id: OTHER, role: 'member' });
      expect(result.state).toMatchObject({
        flow: 'member',
        current_step: 1,
        persisted: false,
        id: null,
      });
      expect(states.rows.has(`${ws}:${OTHER}`)).toBe(false);
    });

    it('saves each step and resumes where the person stopped', async () => {
      await step(1, 'save', { language: 'id' });
      await step(2, 'save', {
        business_name: 'Toko Kopi',
        business_type: 'online_shop',
        team_size: '2_5',
        city: 'Bandung',
      });
      const resumed = await get.execute({ workspace_id: ws, user_id: USER, role: 'owner' });
      expect(resumed.state.current_step).toBe(3);
      expect(resumed.state.answers).toMatchObject({
        language: 'id',
        business_name: 'Toko Kopi',
        city: 'Bandung',
      });
      expect(resumed.state.status).toBe('in_progress');
    });

    it('going back and re-saving an earlier step does not move the person backwards', async () => {
      await step(1, 'save', { language: 'id' });
      await step(2, 'save', { business_name: 'Toko Kopi', business_type: 'online_shop' });
      await step(3, 'save', {});
      await step(2, 'save', { business_name: 'Toko Kopi Baru', business_type: 'online_shop' });
      expect(
        (await get.execute({ workspace_id: ws, user_id: USER, role: 'owner' })).state.current_step,
      ).toBe(4);
    });

    it('keeps one row per workspace and member: two people never share state', async () => {
      workspaces.memberOf.set(OTHER, new Set([ws]));
      await step(1, 'save', { language: 'id' });
      await step(1, 'save', { language: 'en' }, 'member', OTHER);
      expect(states.rows.size).toBe(2);
      expect(
        (await get.execute({ workspace_id: ws, user_id: USER, role: 'owner' })).state.answers
          .language,
      ).toBe('id');
      expect(
        (await get.execute({ workspace_id: ws, user_id: OTHER, role: 'member' })).state.answers
          .language,
      ).toBe('en');
    });

    it('audits onboarding.step_completed for a save', async () => {
      await step(1, 'save', { language: 'id' });
      const event = audit
        .getEvents()
        .filter((e) => e.action === 'onboarding.step_completed')
        .at(-1);
      expect(event?.metadata).toMatchObject({ step: 1 });
    });

    it('step 2 renames the provisional workspace and regenerates the slug ONCE, without spending the custom-slug edit', async () => {
      await step(2, 'save', { business_name: 'Toko Kopi Nusantara', business_type: 'online_shop' });
      const renamed = workspaces.workspaces.get(ws)!;
      expect(renamed.workspace_name).toBe('Toko Kopi Nusantara');
      expect(renamed.workspace_slug).toBe('toko-kopi-nusantara');
      // FR-SHELL-13: the owner still has their one deliberate slug change.
      expect(renamed.slug_changed_at).toBeNull();

      await step(2, 'save', { business_name: 'Kopi Baru', business_type: 'online_shop' });
      const again = workspaces.workspaces.get(ws)!;
      expect(again.workspace_name).toBe('Kopi Baru');
      expect(again.workspace_slug).toBe('toko-kopi-nusantara');
    });

    it('avoids a slug that is already taken', async () => {
      await createWorkspace.execute({
        workspace_name: 'Toko Kopi',
        owner_user_id: OTHER,
        workspace_slug: 'toko-kopi',
      });
      await step(2, 'save', { business_name: 'Toko Kopi', business_type: 'online_shop' });
      const slug = workspaces.workspaces.get(ws)!.workspace_slug;
      expect(slug).not.toBe('toko-kopi');
      expect(slug).toMatch(/^toko-kopi-/);
    });

    it('does not touch the workspace on steps other than 2', async () => {
      const before = workspaces.workspaces.get(ws)!;
      await step(1, 'save', { language: 'en' });
      await step(4, 'save', { goals: ['create_content'] });
      expect(workspaces.workspaces.get(ws)).toEqual(before);
    });

    it('language and business name have no skip; the other steps can be skipped and are audited', async () => {
      await expect(step(1, 'skip')).rejects.toThrow(ValidationError);
      await expect(step(2, 'skip')).rejects.toThrow(ValidationError);
      const skipped = await step(3, 'skip');
      expect(skipped.state.skipped_steps).toEqual([3]);
      expect(
        audit.getEvents().some((e) => e.action === 'onboarding.skipped' && e.metadata?.step === 3),
      ).toBe(true);
      const saved = await step(3, 'save', { website_url: 'https://tokokopi.example' });
      expect(saved.state.skipped_steps).toEqual([]);
    });

    it('requires a business name on step 2', async () => {
      await expect(step(2, 'save', { business_type: 'online_shop' })).rejects.toThrow(ZodError);
    });

    it('accepts up to three goals from the fixed list', async () => {
      await step(4, 'save', { goals: ['create_content', 'faster_replies', 'tax_admin'] });
      await expect(
        step(4, 'save', {
          goals: ['create_content', 'faster_replies', 'tax_admin', 'find_customers'],
        }),
      ).rejects.toThrow(ZodError);
      await expect(step(4, 'save', { goals: ['world_domination'] })).rejects.toThrow(ZodError);
    });

    it('stores Instagram and marketplace inputs as handles and links only (FR-ONB-13)', async () => {
      const result = await step(3, 'save', {
        instagram_handle: '@tokokopi',
        marketplace_url: 'https://shopee.co.id/tokokopi',
      });
      expect(result.state.answers).toMatchObject({
        instagram_handle: '@tokokopi',
        marketplace_url: 'https://shopee.co.id/tokokopi',
      });
      await expect(step(3, 'save', { marketplace_url: 'javascript:alert(1)' })).rejects.toThrow(
        ZodError,
      );
    });

    it('collects the optional About you block, with the phone number normalised and skippable', async () => {
      const result = await step(1, 'save', {
        language: 'id',
        about_you: { preferred_name: 'Amira', salutation: 'bu', phone_number: '0812-3456-7890' },
      });
      expect(result.state.answers.about_you).toMatchObject({
        preferred_name: 'Amira',
        phone_number: '+6281234567890',
      });
      const without = await step(1, 'save', { language: 'id' });
      expect(without.state.answers.about_you).toBeUndefined();
    });

    it('rejects an answer field the step does not know', async () => {
      await expect(step(1, 'save', { language: 'id', user_id: 'someone-else' })).rejects.toThrow(
        ZodError,
      );
    });

    it('invited members run the two-screen welcome, not the full flow', async () => {
      workspaces.memberOf.set(OTHER, new Set([ws]));
      const saved = await step(1, 'save', { language: 'en' }, 'member', OTHER);
      expect(saved.state.flow).toBe('member');
      await expect(
        step(3, 'save', { website_url: 'https://x.example' }, 'member', OTHER),
      ).rejects.toThrow(ValidationError);
      const done = await step(2, 'save', {}, 'member', OTHER);
      expect(done.state.current_step).toBe(2);
      expect(done.state.status).toBe('completed');
      expect(done.state.completed_at).toBe(NOW.toISOString());
      expect(audit.getEvents().some((event) => event.action === 'onboarding.completed')).toBe(true);
      // A member never renames the workspace.
      expect(workspaces.workspaces.get(ws)!.workspace_name).toBe('Workspace saya');
    });

    it('an admin gets the member flow: only the owner runs onboarding (onboarding.run)', async () => {
      workspaces.memberOf.set(OTHER, new Set([ws]));
      const result = await step(1, 'save', { language: 'en' }, 'admin', OTHER);
      expect(result.state.flow).toBe('member');
    });

    it('the checklist completes from events, never from a click', async () => {
      const initial = await get.execute({ workspace_id: ws, user_id: USER, role: 'owner' });
      expect(initial.checklist.find((c) => c.item_key === 'confirm_profile')?.status).toBe(
        'pending',
      );
      expect(initial.checklist.find((c) => c.item_key === 'invite_teammate')?.status).toBe(
        'pending',
      );
      expect(initial.checklist.find((c) => c.item_key === 'add_library_documents')?.status).toBe(
        'pending',
      );

      invitations.acceptedWorkspaces.add(ws);
      await new RecordChecklistEventUseCase({ checklist }).execute({
        workspace_id: ws,
        item_key: 'add_library_documents',
        source: 'library.document_ready',
      });
      const after = await get.execute({ workspace_id: ws, user_id: USER, role: 'owner' });
      expect(after.checklist.find((c) => c.item_key === 'invite_teammate')?.status).toBe('done');
      expect(after.checklist.find((c) => c.item_key === 'add_library_documents')?.status).toBe(
        'done',
      );
      expect(after.checklist.find((c) => c.item_key === 'confirm_profile')?.status).toBe('pending');
    });
  });

  describe('confirm profile: POST onboarding/complete (FR-ONB-06)', () => {
    let ws: string;
    let update: UpdateOnboardingUseCase;
    let complete: CompleteOnboardingUseCase;

    beforeEach(async () => {
      const created = await firstWorkspace().execute({ user_id: USER, context: ctx(undefined) });
      ws = created.workspace.id;
      update = new UpdateOnboardingUseCase({
        states,
        workspaces,
        updateWorkspace,
        audit,
        transactions: noTransaction,
        now: () => NOW,
        newSlugSuffix: () => 'x9y8',
      });
      complete = new CompleteOnboardingUseCase({
        states,
        writer: new BusinessProfileWriter(profileRepo, audit, noTransaction),
        scans,
        checklist,
        audit,
        transactions: noTransaction,
        now: () => NOW,
      });
      await update.execute({
        workspace_id: ws,
        user_id: USER,
        role: 'owner',
        step: 2,
        action: 'save',
        answers: { business_name: 'Toko Kopi', business_type: 'online_shop', city: 'Bandung' },
        context: ctx(ws),
      });
    });

    const finish = (body: Record<string, unknown> = {}, role: RequestContext['role'] = 'owner') =>
      complete.execute({
        workspace_id: ws,
        user_id: USER,
        role,
        input: body,
        context: ctx(ws, USER, role),
      });

    it('writes only what the owner confirmed, each with confirmed_at, as version 1', async () => {
      const result = await finish({ profile: { website_url: 'https://tokokopi.example' } });
      const profile = profileRepo.profiles.get(ws)!;
      expect(profile.display_name).toBe('Toko Kopi');
      expect(profile.city).toBe('Bandung');
      expect(profile.website_url).toBe('https://tokokopi.example');
      expect(profile.field_meta.display_name?.confirmed_at).toBe(NOW.toISOString());
      expect(profile.field_meta.website_url?.confirmed_at).toBe(NOW.toISOString());
      expect(profile.audience).toBeNull();
      expect(result.version).toBe(1);
      expect(profileRepo.versions).toHaveLength(1);
    });

    it('discards unconfirmed scan suggestions: they never reach the profile', async () => {
      const created = await scans.createIfUnderLimit({
        workspace_id: ws,
        requested_by: USER,
        url: 'https://tokokopi.example/',
        now: NOW,
        limit: 5,
        window_ms: 3600000,
        ttl_ms: 86400000,
      });
      if (created.limited) throw new Error('unexpected');
      await scans.recordOutcome(ws, created.scan.id, {
        status: 'succeeded',
        error_code: null,
        result: {
          scan_id: created.scan.id,
          status: 'succeeded',
          source_url: 'https://tokokopi.example/',
          final_url: null,
          fetched_pages: 1,
          site_language: 'id',
          fields: {
            description: {
              value: 'Suggested but never confirmed',
              source_url: 'https://tokokopi.example/',
              evidence_snippet: 'x',
            },
          },
          offers: [
            {
              name: 'Suggested offer',
              description: null,
              source_url: 'https://tokokopi.example/',
              evidence_snippet: 'y',
            },
          ],
          policies: [],
          error_code: null,
        },
      });
      await finish({ scan_id: created.scan.id });
      expect(JSON.stringify([...profileRepo.profiles.values()])).not.toContain(
        'Suggested but never confirmed',
      );
      expect(profileRepo.offerings).toHaveLength(0);
      expect(await scans.findById(ws, created.scan.id)).toBeNull();
    });

    it('writes confirmed offers and policies the owner sends, marked with their source', async () => {
      await finish({
        offerings: [
          { name: 'Kopi Gayo', price_amount: 85000 },
          { name: 'Dripper', source: 'scan' },
        ],
        policies: [{ kind: 'returns', title: 'Returns', body: 'Within 7 days.', source: 'scan' }],
      });
      expect(
        profileRepo.offerings.map((o) => [o.name, o.price_amount, o.source, o.confirmed_at]),
      ).toEqual([
        ['Kopi Gayo', 85000, 'user', NOW.toISOString()],
        ['Dripper', null, 'scan', NOW.toISOString()],
      ]);
      expect(profileRepo.policies[0]).toMatchObject({
        kind: 'returns',
        source: 'scan',
        confirmed_at: NOW.toISOString(),
      });
      expect(profileRepo.versions).toHaveLength(1);
    });

    it('marks onboarding completed, records the checklist item and audits onboarding.completed', async () => {
      await finish();
      const state = states.rows.get(`${ws}:${USER}`)!;
      expect(state.status).toBe('completed');
      expect(state.completed_at).toBe(NOW.toISOString());
      expect((await checklist.listDone(ws)).map((d) => d.item_key)).toEqual(['confirm_profile']);
      expect(audit.getEvents().some((e) => e.action === 'onboarding.completed')).toBe(true);
    });

    it('needs a business name', async () => {
      const second = await firstWorkspace().execute({
        user_id: OTHER,
        context: ctx(undefined, OTHER),
      });
      await expect(
        complete.execute({
          workspace_id: second.workspace.id,
          user_id: OTHER,
          role: 'owner',
          input: {},
          context: ctx(second.workspace.id, OTHER),
        }),
      ).rejects.toThrow(ValidationError);
      expect(profileRepo.profiles.has(second.workspace.id)).toBe(false);
    });

    it('only the owner can confirm through onboarding; members and admins cannot', async () => {
      await expect(finish({}, 'member')).rejects.toThrow(ForbiddenError);
      await expect(finish({}, 'admin')).rejects.toThrow(ForbiddenError);
      expect(profileRepo.profiles.size).toBe(0);
    });

    it('cannot be completed twice', async () => {
      await finish();
      await expect(finish()).rejects.toThrow(ConflictError);
      expect(profileRepo.versions).toHaveLength(1);
    });
  });

  describe('first tasks (FR-ONB-21, 22, 23)', () => {
    let ws: string;

    beforeEach(async () => {
      ws = (await firstWorkspace().execute({ user_id: USER, context: ctx(undefined) })).workspace
        .id;
      await new UpdateOnboardingUseCase({
        states,
        workspaces,
        updateWorkspace,
        audit,
        transactions: noTransaction,
        now: () => NOW,
        newSlugSuffix: () => 'x9y8',
      }).execute({
        workspace_id: ws,
        user_id: USER,
        role: 'owner',
        step: 2,
        action: 'save',
        answers: { business_name: 'Toko Kopi', business_type: 'online_shop' },
        context: ctx(ws),
      });
    });

    const tasks = (locale?: 'en' | 'id') =>
      new GetFirstTasksUseCase({ states, repo: profileRepo, now: () => NOW }).execute({
        workspace_id: ws,
        user_id: USER,
        locale,
      });

    it('returns exactly three tasks with the business real name, in both locales', async () => {
      const en = await tasks('en');
      const id = await tasks('id');
      expect(en).toHaveLength(3);
      expect(id).toHaveLength(3);
      expect(en.map((t) => t.message).join(' ')).toContain('Toko Kopi');
      expect(en[0].message).toMatch(/^@Sino[A-Za-z]+ /);
    });

    it('fills the first confirmed offer name, never an unconfirmed one', async () => {
      await profileRepo.createOffering(ws, {
        name: 'Draft Offer',
        description: null,
        price_amount: null,
        price_currency: 'IDR',
        url: null,
        source: 'user',
        confirmed_at: null,
      });
      await profileRepo.createOffering(ws, {
        name: 'Kopi Gayo 250g',
        description: null,
        price_amount: null,
        price_currency: 'IDR',
        url: null,
        source: 'user',
        confirmed_at: NOW.toISOString(),
      });
      const text = (await tasks('en')).map((t) => t.message).join(' ');
      expect(text).toContain('Kopi Gayo 250g');
      expect(text).not.toContain('Draft Offer');
    });

    it('a dismissed task does not come back within a week', async () => {
      const first = await tasks('en');
      const dismiss = new DismissFirstTaskUseCase({ states, now: () => NOW });
      await dismiss.execute({
        workspace_id: ws,
        user_id: USER,
        role: 'owner',
        task_id: first[0].task_id,
      });
      const after = await tasks('en');
      expect(after).toHaveLength(3);
      expect(after.map((t) => t.task_id)).not.toContain(first[0].task_id);
    });

    it('refuses to dismiss a task that is not in the catalog', async () => {
      await expect(
        new DismissFirstTaskUseCase({ states, now: () => NOW }).execute({
          workspace_id: ws,
          user_id: USER,
          role: 'owner',
          task_id: 'made_up',
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('provisional slug option of the existing rename use case', () => {
    it('renames without spending slug_changed_at, and the normal path still does', async () => {
      const ws = await createWorkspace.execute({
        workspace_name: 'My workspace',
        owner_user_id: USER,
      });
      const provisional = await updateWorkspace.execute({
        workspace_id: ws.id,
        workspace_name: 'Toko',
        workspace_slug: 'toko',
        provisional_slug: true,
      });
      expect(provisional.slug_changed_at).toBeNull();
      const custom = await updateWorkspace.execute({
        workspace_id: ws.id,
        workspace_slug: 'toko-kopi',
      });
      expect(custom.slug_changed_at).not.toBeNull();
      await expect(
        updateWorkspace.execute({ workspace_id: ws.id, workspace_slug: 'toko-kopi-2' }),
      ).rejects.toThrow(ValidationError);
    });
  });
});
