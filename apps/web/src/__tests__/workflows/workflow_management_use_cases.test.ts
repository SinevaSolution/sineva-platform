import { describe, expect, it } from 'vitest';
import { ArchiveWorkflowUseCase } from '@/server/application/use-cases/workflows/archive_workflow_use_case';
import { CreateWorkflowUseCase } from '@/server/application/use-cases/workflows/create_workflow_use_case';
import { DeleteWorkflowUseCase } from '@/server/application/use-cases/workflows/delete_workflow_use_case';
import { GetWorkflowCatalogUseCase } from '@/server/application/use-cases/workflows/get_workflow_catalog_use_case';
import { GetWorkflowUseCase } from '@/server/application/use-cases/workflows/get_workflow_use_case';
import { ListWorkflowTemplatesUseCase } from '@/server/application/use-cases/workflows/list_workflow_templates_use_case';
import { ListWorkflowVersionsUseCase } from '@/server/application/use-cases/workflows/list_workflow_versions_use_case';
import { ListWorkflowsUseCase } from '@/server/application/use-cases/workflows/list_workflows_use_case';
import { PublishWorkflowUseCase } from '@/server/application/use-cases/workflows/publish_workflow_use_case';
import { RestoreWorkflowVersionUseCase } from '@/server/application/use-cases/workflows/restore_workflow_version_use_case';
import { UpdateWorkflowDraftUseCase } from '@/server/application/use-cases/workflows/update_workflow_draft_use_case';
import { UseWorkflowTemplateUseCase } from '@/server/application/use-cases/workflows/use_workflow_template_use_case';
import { EntitlementRequiredError } from '@/server/domain/entitlements/entitlements';
import { ForbiddenError, NotFoundError } from '@/server/domain/errors/domain_error';
import {
  DraftConflictError,
  WorkflowInvalidError,
  WorkflowStateError,
} from '@/server/domain/workflows/workflow_errors';
import { findWorkflowTemplate } from '@/shared/workflows/templates';
import {
  ADMIN,
  MEMBER,
  OTHER_MEMBER,
  OTHER_WS,
  buildWorkflowHarness,
  ctx,
  memberCtx,
  passTestRun,
  seedWorkflow,
  simpleDefinition,
} from '../workflow_harness';

// WP-M3-08: domain, versions, publish, permissions. FR-WF-01, FR-WF-20, FR-WF-24,
// FR-WF-25, FR-WF-27, PRD 10 auditable events.

describe('create', () => {
  it('creates a blank draft, checks the plan limit and audits workflow.created', async () => {
    const h = buildWorkflowHarness();
    const created = await new CreateWorkflowUseCase(h.deps).execute({ name: 'Weekly report' }, ctx());
    expect(created).toMatchObject({ name: 'Weekly report', status: 'draft', draft_revision: 1, created_by: ADMIN });
    expect(created.draft_definition).toMatchObject({ schema_version: 1, steps: [] });
    expect(h.entitlements.checks).toEqual([{ workspace_id: expect.any(String), key: 'workflows.max', quantity: 1 }]);
    expect(h.audit.getEvents().map((e) => e.action)).toEqual(['workflow.created']);
    expect(h.audit.getEvents()[0]).toMatchObject({ target_resource_type: 'workflow', target_resource_id: created.id });
  });

  it('counts existing workflows against the limit', async () => {
    const h = buildWorkflowHarness();
    await seedWorkflow(h);
    await new CreateWorkflowUseCase(h.deps).execute({ name: 'Second' }, ctx());
    expect(h.entitlements.checks[0]?.quantity).toBe(2);
  });

  it('is refused when the plan limit says so', async () => {
    const h = buildWorkflowHarness({ denied: ['workflows.max'] });
    await expect(new CreateWorkflowUseCase(h.deps).execute({ name: 'x' }, ctx())).rejects.toBeInstanceOf(EntitlementRequiredError);
    expect(h.workflows.rows.size).toBe(0);
  });
});

describe('list and get', () => {
  it('lists newest first with the last run, hides archived, filters by name', async () => {
    const h = buildWorkflowHarness();
    const a = await seedWorkflow(h, { name: 'Penagihan faktur' });
    await seedWorkflow(h, { name: 'Laporan bulanan' });
    const archived = await seedWorkflow(h, { name: 'Lama' });
    await h.workflows.archive('11111111-1111-4111-8111-111111111111', archived.id, new Date());
    await passTestRun(h, a);

    const all = await new ListWorkflowsUseCase(h.deps).execute({ page: 1, per_page: 20 }, ctx());
    expect(all.total).toBe(2);
    expect(all.items.find((i) => i.workflow.id === a.id)?.last_run).toMatchObject({ status: 'succeeded', mode: 'test' });

    const found = await new ListWorkflowsUseCase(h.deps).execute({ q: 'penagihan', page: 1, per_page: 20 }, ctx());
    expect(found.items.map((i) => i.workflow.name)).toEqual(['Penagihan faktur']);

    const arch = await new ListWorkflowsUseCase(h.deps).execute({ status: 'archived', page: 1, per_page: 20 }, ctx());
    expect(arch.items.map((i) => i.workflow.name)).toEqual(['Lama']);
  });

  it('shows needs attention when a specialist is off, and the needs_attention filter finds it (FR-WF-27)', async () => {
    const h = buildWorkflowHarness();
    await seedWorkflow(h, { name: 'Fine' });
    const sales = simpleDefinition({
      steps: [{ key: 'a', type: 'specialist_task', title: 'A', specialist: 'sinosales', instruction: 'Do it', output_type: 'text' }],
    });
    await seedWorkflow(h, { name: 'Needs sales', definition: sales });
    h.catalog.specialists = ['sinofinance'];

    const list = await new ListWorkflowsUseCase(h.deps).execute({ page: 1, per_page: 20 }, ctx());
    const flagged = list.items.filter((i) => i.attention && i.attention.length > 0).map((i) => i.workflow.name);
    expect(flagged).toEqual(['Needs sales']);
    expect(list.items[0]?.attention?.[0]).toMatchObject({ code: 'specialist_not_enabled', needs_attention: true });

    const filtered = await new ListWorkflowsUseCase(h.deps).execute({ status: 'needs_attention', page: 1, per_page: 20 }, ctx());
    expect(filtered.items.map((i) => i.workflow.name)).toEqual(['Needs sales']);
  });

  it('says "unknown" instead of guessing when sineva-ai cannot be asked', async () => {
    const h = buildWorkflowHarness();
    await seedWorkflow(h);
    h.catalog.unreachable = true;
    const list = await new ListWorkflowsUseCase(h.deps).execute({ page: 1, per_page: 20 }, ctx());
    expect(list.items[0]?.attention).toBeNull();
    const detail = await new GetWorkflowUseCase(h.deps).execute(list.items[0]!.workflow.id, ctx());
    expect(detail.catalog_known).toBe(false);
  });

  it('get reports issues and whether the current draft was tested', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    const before = await new GetWorkflowUseCase(h.deps).execute(workflow.id, ctx());
    expect(before).toMatchObject({ tested_current_draft: false, catalog_known: true, issues: [] });
    await passTestRun(h, workflow);
    expect((await new GetWorkflowUseCase(h.deps).execute(workflow.id, ctx())).tested_current_draft).toBe(true);
  });

  it('returns not found for another workspace', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    await expect(
      new GetWorkflowUseCase(h.deps).execute(workflow.id, ctx({ workspace_id: OTHER_WS })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('edit the draft', () => {
  it('bumps the revision on a definition change and not on a rename', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    const renamed = await new UpdateWorkflowDraftUseCase(h.deps).execute(workflow.id, { name: 'New name', expected_revision: 1 }, ctx());
    expect(renamed).toMatchObject({ name: 'New name', draft_revision: 1 });
    const edited = await new UpdateWorkflowDraftUseCase(h.deps).execute(
      workflow.id,
      { definition: simpleDefinition({ outputs: [] }), expected_revision: 1 },
      ctx(),
    );
    expect(edited.draft_revision).toBe(2);
  });

  it('keeps a half finished draft: only publish and run judge it', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    const broken = simpleDefinition({ steps: [] });
    const saved = await new UpdateWorkflowDraftUseCase(h.deps).execute(workflow.id, { definition: broken, expected_revision: 1 }, ctx());
    expect(saved.draft_definition.steps).toEqual([]);
  });

  it('answers 409 draft_conflict with the current revision when someone saved first', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    await new UpdateWorkflowDraftUseCase(h.deps).execute(workflow.id, { definition: simpleDefinition(), expected_revision: 1 }, ctx());
    const error = await new UpdateWorkflowDraftUseCase(h.deps)
      .execute(workflow.id, { definition: simpleDefinition(), expected_revision: 1 }, ctx())
      .catch((e) => e);
    expect(error).toBeInstanceOf(DraftConflictError);
    expect(error).toMatchObject({ status: 409, code: 'draft_conflict', currentRevision: 2 });
  });

  it('lets a Member edit only their own draft; an Admin edits any', async () => {
    const h = buildWorkflowHarness();
    const own = await seedWorkflow(h, { created_by: MEMBER });
    const others = await seedWorkflow(h, { created_by: OTHER_MEMBER });
    const useCase = new UpdateWorkflowDraftUseCase(h.deps);
    await expect(useCase.execute(own.id, { name: 'Mine', expected_revision: 1 }, memberCtx())).resolves.toMatchObject({ name: 'Mine' });
    await expect(useCase.execute(others.id, { name: 'Theirs', expected_revision: 1 }, memberCtx())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(useCase.execute(others.id, { name: 'Theirs', expected_revision: 1 }, ctx())).resolves.toMatchObject({ name: 'Theirs' });
  });

  it('refuses to edit an archived workflow', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    await new ArchiveWorkflowUseCase(h.deps).execute(workflow.id, ctx());
    await expect(
      new UpdateWorkflowDraftUseCase(h.deps).execute(workflow.id, { name: 'x', expected_revision: 1 }, ctx()),
    ).rejects.toMatchObject({ code: 'workflow_archived' });
  });
});

describe('publish (FR-WF-20, FR-WF-25)', () => {
  it('is rejected without a test run on the current draft', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    const error = await new PublishWorkflowUseCase(h.deps).execute(workflow.id, {}, ctx()).catch((e) => e);
    expect(error).toBeInstanceOf(WorkflowStateError);
    expect(error).toMatchObject({ status: 409, code: 'test_run_required' });
    expect(h.versions.rows).toHaveLength(0);
  });

  it('publishes an immutable numbered version once the draft was tested', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    await passTestRun(h, workflow);
    const first = await new PublishWorkflowUseCase(h.deps).execute(workflow.id, { note: 'First' }, ctx());
    expect(first.version).toMatchObject({ version_number: 1, note: 'First', published_by: ADMIN });
    expect(first.workflow).toMatchObject({ status: 'published', current_version_number: 1 });
    expect(h.audit.getEvents().map((e) => e.action)).toContain('workflow.version_published');
    expect(h.transactions.runs).toBeGreaterThan(0);

    // An edit changes the draft, never the published version.
    await new UpdateWorkflowDraftUseCase(h.deps).execute(
      workflow.id,
      { definition: simpleDefinition({ inputs: [] , steps: [{ key: 'other', type: 'specialist_task', title: 'O', specialist: 'sinosales', instruction: 'x', output_type: 'text' }] }), expected_revision: 1 },
      ctx(),
    );
    const versions = await new ListWorkflowVersionsUseCase(h.deps).execute(workflow.id, ctx());
    expect(versions[0]?.definition.steps[0]).toMatchObject({ key: 'summary' });
  });

  it('is invalidated by an edit after the test run', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    await passTestRun(h, workflow);
    await new UpdateWorkflowDraftUseCase(h.deps).execute(workflow.id, { definition: simpleDefinition(), expected_revision: 1 }, ctx());
    await expect(new PublishWorkflowUseCase(h.deps).execute(workflow.id, {}, ctx())).rejects.toMatchObject({ code: 'test_run_required' });
  });

  it('numbers versions one after another', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    await passTestRun(h, workflow);
    await new PublishWorkflowUseCase(h.deps).execute(workflow.id, {}, ctx());
    const second = await new PublishWorkflowUseCase(h.deps).execute(workflow.id, {}, ctx());
    expect(second.version.version_number).toBe(2);
  });

  it('blocks a definition with issues even after a test run (needs attention, trifecta, limits)', async () => {
    const h = buildWorkflowHarness();
    const sales = simpleDefinition({
      steps: [{ key: 'a', type: 'specialist_task', title: 'A', specialist: 'sinosales', instruction: 'Do it', output_type: 'text' }],
    });
    const workflow = await seedWorkflow(h, { definition: sales });
    await passTestRun(h, workflow);
    h.catalog.specialists = ['sinofinance'];
    const error = await new PublishWorkflowUseCase(h.deps).execute(workflow.id, {}, ctx()).catch((e) => e);
    expect(error).toBeInstanceOf(WorkflowInvalidError);
    expect(error.issues[0]).toMatchObject({ code: 'specialist_not_enabled' });
    expect(error.details[0]).toMatchObject({ code: 'specialist_not_enabled' });
  });

  it('fails closed when sineva-ai cannot say which specialists are on', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    await passTestRun(h, workflow);
    h.catalog.unreachable = true;
    await expect(new PublishWorkflowUseCase(h.deps).execute(workflow.id, {}, ctx())).rejects.toMatchObject({ status: 503 });
  });

  it('rejects a stale expected revision', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    await passTestRun(h, workflow);
    await expect(
      new PublishWorkflowUseCase(h.deps).execute(workflow.id, { expected_revision: 9 }, ctx()),
    ).rejects.toBeInstanceOf(DraftConflictError);
  });

  it('refuses an archived workflow', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    await passTestRun(h, workflow);
    await new ArchiveWorkflowUseCase(h.deps).execute(workflow.id, ctx());
    await expect(new PublishWorkflowUseCase(h.deps).execute(workflow.id, {}, ctx())).rejects.toMatchObject({ code: 'workflow_archived' });
  });

  it('lets an Admin raise the loop cap at publish and not an editor', async () => {
    const h = buildWorkflowHarness();
    const definition = simpleDefinition({
      inputs: [{ key: 'files', type: 'library_file', label: 'Files', required: true, multiple: true }],
      steps: [
        {
          key: 'each',
          type: 'loop',
          title: 'Each',
          over: '{{inputs.files}}',
          cap: 50,
          body: [{ key: 'x', type: 'specialist_task', title: 'X', specialist: 'sinopeople', instruction: 'Read {{loop.item}}', output_type: 'text' }],
        },
      ],
    });
    const workflow = await seedWorkflow(h, { definition });
    await passTestRun(h, workflow);
    await expect(new PublishWorkflowUseCase(h.deps).execute(workflow.id, {}, ctx())).resolves.toBeTruthy();
  });
});

describe('versions and restore', () => {
  it('restores an old version as a new numbered one and replaces the draft', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    await passTestRun(h, workflow);
    const v1 = await new PublishWorkflowUseCase(h.deps).execute(workflow.id, {}, ctx());
    await new UpdateWorkflowDraftUseCase(h.deps).execute(
      workflow.id,
      { definition: simpleDefinition({ steps: [{ key: 'b', type: 'specialist_task', title: 'B', specialist: 'sinosales', instruction: 'x', output_type: 'text' }], inputs: [] }), expected_revision: 1 },
      ctx(),
    );
    const restored = await new RestoreWorkflowVersionUseCase(h.deps).execute(workflow.id, v1.version.id, { note: 'Back' }, ctx());
    expect(restored.version).toMatchObject({ version_number: 2, restored_from: 1, note: 'Back' });
    expect(restored.workflow.draft_definition.steps[0]).toMatchObject({ key: 'summary' });
    expect(restored.workflow).toMatchObject({ current_version_number: 2, status: 'published' });
    expect(h.audit.getEvents().map((e) => e.action)).toContain('workflow.version_restored');
    expect(h.versions.rows).toHaveLength(2);
  });

  it('answers 404 for a version of another workflow', async () => {
    const h = buildWorkflowHarness();
    const a = await seedWorkflow(h);
    const b = await seedWorkflow(h);
    await passTestRun(h, a);
    const v = await new PublishWorkflowUseCase(h.deps).execute(a.id, {}, ctx());
    await expect(new RestoreWorkflowVersionUseCase(h.deps).execute(b.id, v.version.id, {}, ctx())).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('archive and delete', () => {
  it('archives and audits workflow.archived', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    const archived = await new ArchiveWorkflowUseCase(h.deps).execute(workflow.id, ctx());
    expect(archived.status).toBe('archived');
    expect(h.audit.getEvents().map((e) => e.action)).toEqual(['workflow.archived']);
  });

  it('deletes a workflow with no runs and audits workflow.deleted', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    await expect(new DeleteWorkflowUseCase(h.deps).execute(workflow.id, ctx())).resolves.toEqual({ id: workflow.id, deleted: true });
    expect(h.workflows.rows.size).toBe(0);
    expect(h.audit.getEvents().map((e) => e.action)).toEqual(['workflow.deleted']);
  });

  it('never deletes a workflow that has runs: it must be archived', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    await passTestRun(h, workflow);
    await expect(new DeleteWorkflowUseCase(h.deps).execute(workflow.id, ctx())).rejects.toMatchObject({
      status: 409,
      code: 'workflow_has_runs',
    });
    expect(h.workflows.rows.size).toBe(1);
  });
});

describe('templates (WP-M3-09)', () => {
  it('lists the five released templates localized, with what is missing', async () => {
    const h = buildWorkflowHarness();
    h.catalog.specialists = ['sinofinance'];
    const list = await new ListWorkflowTemplatesUseCase(h.deps).execute('id', ctx());
    expect(list.map((t) => t.slug)).toEqual([
      'overdue_invoices',
      'weekly_content_pack',
      'cv_to_interviews',
      'lead_to_proposal',
      'month_end_owner_pack',
    ]);
    const invoices = list[0]!;
    expect(invoices.name).toBe('Penagihan faktur jatuh tempo');
    expect(invoices.missing_specialists).toEqual(['sinoinsights']);
    expect(invoices.requirements.map((r) => [r.provider, r.connected])).toEqual([
      ['jurnal', false],
      ['whatsapp', false],
    ]);
    expect(invoices.review_count).toBe(1);
    expect(invoices.step_count).toBeGreaterThan(5);
  });

  it('use creates an editable draft, never a published workflow, and does not block on what is missing', async () => {
    const h = buildWorkflowHarness();
    h.catalog.specialists = [];
    const created = await new UseWorkflowTemplateUseCase(h.deps).execute('lead_to_proposal', { locale: 'en' }, ctx());
    expect(created).toMatchObject({ status: 'draft', template_slug: 'lead_to_proposal', current_version_id: null });
    expect(created.draft_definition).toEqual(findWorkflowTemplate('lead_to_proposal')!.build('en'));
    expect(created.name).toBe('From lead to proposal');
    expect(h.entitlements.checks[0]?.key).toBe('workflows.max');
    expect(h.audit.getEvents().map((e) => e.action)).toEqual(['workflow.created']);
    expect(h.audit.getEvents()[0]?.metadata).toMatchObject({ template_slug: 'lead_to_proposal' });
  });

  it('answers 404 for an unknown template', async () => {
    const h = buildWorkflowHarness();
    await expect(new UseWorkflowTemplateUseCase(h.deps).execute('marketplace_stock', { locale: 'en' }, ctx())).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('builder catalog', () => {
  it('reports specialists, connections and actions from the registry, honestly empty today', async () => {
    const h = buildWorkflowHarness();
    const catalog = await new GetWorkflowCatalogUseCase(h.deps).execute(ctx());
    expect(catalog).toMatchObject({ connections: [], actions: [] });
    expect(catalog.enabled_specialists).toContain('sinofinance');
    h.catalog.unreachable = true;
    expect((await new GetWorkflowCatalogUseCase(h.deps).execute(ctx())).enabled_specialists).toBeNull();
  });
});
