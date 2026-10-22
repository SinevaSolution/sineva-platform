import { describe, expect, it, vi } from 'vitest';
import { ApplyWorkflowRunEventUseCase } from '@/server/application/use-cases/workflows/apply_workflow_run_event_use_case';
import { CancelWorkflowRunUseCase } from '@/server/application/use-cases/workflows/cancel_workflow_run_use_case';
import { GetWorkflowRunUseCase } from '@/server/application/use-cases/workflows/get_workflow_run_use_case';
import { ListWorkflowRunsUseCase } from '@/server/application/use-cases/workflows/list_workflow_runs_use_case';
import { PublishWorkflowUseCase } from '@/server/application/use-cases/workflows/publish_workflow_use_case';
import { ResumeWorkflowRunUseCase } from '@/server/application/use-cases/workflows/resume_workflow_run_use_case';
import { StartWorkflowRunUseCase } from '@/server/application/use-cases/workflows/start_workflow_run_use_case';
import { WorkflowRunEventSchema } from '@/server/application/workflows/run_event_dto';
import { ForbiddenError, NotFoundError, UpstreamServiceError } from '@/server/domain/errors/domain_error';
import {
  WorkflowEngineUnavailableError,
  WorkflowInvalidError,
  WorkflowStateError,
} from '@/server/domain/workflows/workflow_errors';
import type { RunSnapshot } from '@/server/domain/workflows/workflow_ports';
import eventRunStatus from '../contract/fixtures/workflow_run_event_run_status.json';
import eventSucceeded from '../contract/fixtures/workflow_run_event_run_succeeded.json';
import eventStepFailed from '../contract/fixtures/workflow_run_event_step_failed.json';
import snapshotFailed from '../contract/fixtures/workflow_run_snapshot_failed_step.json';
import snapshotReview from '../contract/fixtures/workflow_run_snapshot_needs_review.json';
import snapshotSucceeded from '../contract/fixtures/workflow_run_snapshot_succeeded.json';
import transcript from '../contract/fixtures/workflow_run_events_transcript_review.json';
import {
  ADMIN,
  MEMBER,
  OTHER_MEMBER,
  OTHER_WS,
  buildWorkflowHarness,
  ctx,
  memberCtx,
  ownerCtx,
  passTestRun,
  seedWorkflow,
  simpleDefinition,
  type WorkflowHarness,
} from '../workflow_harness';

// WP-M3-02 and WP-M3-04 (platform side), WP-M3-08 task 3, WP-M3-13: start with
// an honest "cannot run yet", reconcile, cancel, resume, and the pushed events
// of the proposed contract (ADR-0046).

const parseEvent = (raw: unknown) => WorkflowRunEventSchema.parse(raw);
const asSnapshot = (fixture: unknown) => (fixture as { data: RunSnapshot }).data;

async function startTest(h: WorkflowHarness, extra: { workflow?: Awaited<ReturnType<typeof seedWorkflow>>; context?: ReturnType<typeof ctx> } = {}) {
  const workflow = extra.workflow ?? (await seedWorkflow(h));
  const run = await new StartWorkflowRunUseCase(h.deps).execute(workflow.id, { mode: 'test', inputs: { days: 14 } }, extra.context ?? ctx());
  return { workflow, run };
}

describe('start a run', () => {
  it('starts a test run of the draft: snapshot, signed context with the run id and budget, audit', async () => {
    const h = buildWorkflowHarness();
    const { workflow, run } = await startTest(h);

    expect(run).toMatchObject({
      status: 'queued',
      mode: 'test',
      version_id: null,
      version_number: null,
      draft_revision: 1,
      trigger_type: 'manual',
      started_by: ADMIN,
      inputs: { days: 14 },
    });
    expect(run.definition).toEqual(workflow.draft_definition);

    const { request, call } = h.gateway.started[0]!;
    expect(request).toMatchObject({
      run_id: run.engine_run_id,
      kind: 'workflow',
      mode: 'test',
      workflow_id: workflow.id,
      version_number: null,
      definition_revision: 1,
      inputs: { days: 14 },
      trigger_type: 'manual',
      routine_id: null,
    });
    // Identity travels in the signed context only, never in the body.
    expect(Object.keys(request)).not.toContain('tenant_id');
    expect(Object.keys(request)).not.toContain('user_id');
    expect(request.library_principals).toEqual(['agent:sinofinance', `workflow:${workflow.id}`, 'workspace']);
    expect(call.context_token).toBe('test.context.token');

    expect(h.signer.minted[0]?.options).toMatchObject({
      run_id: run.engine_run_id,
      budget: {
        max_credits: null,
        max_tokens: null,
        max_tool_calls: null,
        max_wall_ms: null,
        max_media_jobs: null,
        max_media_cost: null,
      },
    });
    const started = h.audit.getEvents().find((e) => e.action === 'workflow.run.started');
    expect(started).toMatchObject({ target_resource_id: workflow.id, run_id: run.engine_run_id });
    expect(started?.metadata).toMatchObject({ mode: 'test', trigger_type: 'manual' });
  });

  it('applies input defaults and rejects missing, unknown and wrongly typed inputs with a field', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    const useCase = new StartWorkflowRunUseCase(h.deps);
    const run = await useCase.execute(workflow.id, { mode: 'test', inputs: {} }, ctx());
    expect(run.inputs).toEqual({ days: 7 });

    const required = await seedWorkflow(h, {
      definition: simpleDefinition({ inputs: [{ key: 'days', type: 'number', label: 'Days', required: true }] }),
    });
    await expect(useCase.execute(required.id, { mode: 'test', inputs: {} }, ctx())).rejects.toMatchObject({
      status: 422,
      details: [{ code: 'input_required', field: 'inputs.days' }],
    });
    await expect(useCase.execute(workflow.id, { mode: 'test', inputs: { nope: 'x' } }, ctx())).rejects.toMatchObject({
      details: [{ code: 'unknown_input', field: 'inputs.nope' }],
    });
    await expect(useCase.execute(workflow.id, { mode: 'test', inputs: { days: 'many' } }, ctx())).rejects.toMatchObject({
      details: [{ code: 'input_invalid', field: 'inputs.days' }],
    });
    expect(h.gateway.started).toHaveLength(1);
  });

  it('a live run needs a published version and pins it; a chat start says so (FR-WF-22)', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    const useCase = new StartWorkflowRunUseCase(h.deps);
    await expect(useCase.execute(workflow.id, { mode: 'live', inputs: {} }, ctx())).rejects.toMatchObject({
      status: 409,
      code: 'not_published',
    });

    await passTestRun(h, workflow);
    await new PublishWorkflowUseCase(h.deps).execute(workflow.id, {}, ctx());
    const run = await useCase.execute(workflow.id, { mode: 'live', inputs: {} }, ctx(), { trigger_type: 'chat' });
    expect(run).toMatchObject({ mode: 'live', version_number: 1, draft_revision: null, trigger_type: 'chat' });
    expect(run.version_id).not.toBeNull();
    expect(h.gateway.started[0]?.request).toMatchObject({ mode: 'live', version_number: 1, definition_revision: null, trigger_type: 'chat' });
  });

  it('never lets a live run read a later edit of the draft', async () => {
    const h = buildWorkflowHarness();
    const workflow = await seedWorkflow(h);
    await passTestRun(h, workflow);
    await new PublishWorkflowUseCase(h.deps).execute(workflow.id, {}, ctx());
    await h.workflows.replaceDraft(
      workflow.workspace_id,
      workflow.id,
      simpleDefinition({ steps: [{ key: 'other', type: 'specialist_task', title: 'O', specialist: 'sinosales', instruction: 'x', output_type: 'text' }], inputs: [] }),
    );
    await new StartWorkflowRunUseCase(h.deps).execute(workflow.id, { mode: 'live', inputs: {} }, ctx());
    expect(h.gateway.started[0]?.request.definition.steps[0]).toMatchObject({ key: 'summary' });
  });

  it('refuses an archived workflow and one that needs attention (FR-WF-27)', async () => {
    const h = buildWorkflowHarness();
    const sales = simpleDefinition({
      inputs: [],
      steps: [{ key: 'a', type: 'specialist_task', title: 'A', specialist: 'sinosales', instruction: 'Do it', output_type: 'text' }],
    });
    const needs = await seedWorkflow(h, { definition: sales });
    h.catalog.specialists = ['sinofinance'];
    const error = await new StartWorkflowRunUseCase(h.deps).execute(needs.id, { mode: 'test', inputs: {} }, ctx()).catch((e) => e);
    expect(error).toBeInstanceOf(WorkflowInvalidError);
    expect(error.issues[0]).toMatchObject({ code: 'specialist_not_enabled' });

    const archived = await seedWorkflow(h);
    await h.workflows.archive(archived.workspace_id, archived.id, new Date());
    await expect(
      new StartWorkflowRunUseCase(h.deps).execute(archived.id, { mode: 'test', inputs: {} }, ctx()),
    ).rejects.toMatchObject({ code: 'workflow_archived' });
    expect(h.gateway.started).toHaveLength(0);
  });

  it('says it cannot run yet when sineva-ai is unreachable: 503, no run left behind, no started audit', async () => {
    const h = buildWorkflowHarness();
    h.gateway.failWith = 'unavailable';
    const workflow = await seedWorkflow(h);
    const error = await new StartWorkflowRunUseCase(h.deps)
      .execute(workflow.id, { mode: 'test', inputs: {} }, ctx())
      .catch((e) => e);
    expect(error).toBeInstanceOf(WorkflowEngineUnavailableError);
    expect(error).toMatchObject({ status: 503, code: 'workflow_engine_unavailable' });
    expect(h.runs.rows.size).toBe(0);
    expect(h.audit.getEvents().map((e) => e.action)).not.toContain('workflow.run.started');
    expect(h.log.warnings[0]).toMatchObject({ event: 'workflow.run_start_failed', fields: { reason: 'unavailable' } });
    expect(JSON.stringify(h.log.warnings)).not.toContain('Summarize');
  });

  it('keeps a failed run when sineva-ai answers badly: 502, status failed with engine_error', async () => {
    const h = buildWorkflowHarness();
    h.gateway.failWith = 'bad_answer';
    const workflow = await seedWorkflow(h);
    await expect(
      new StartWorkflowRunUseCase(h.deps).execute(workflow.id, { mode: 'test', inputs: {} }, ctx()),
    ).rejects.toBeInstanceOf(UpstreamServiceError);
    const [run] = [...h.runs.rows.values()];
    expect(run).toMatchObject({ status: 'failed', error_code: 'engine_error' });
    expect(h.audit.getEvents().map((e) => e.action)).toContain('workflow.run.failed');
  });

  it('marks the run as started when the engine already moved it on', async () => {
    const h = buildWorkflowHarness();
    h.gateway.acceptedStatus = 'running';
    const { run } = await startTest(h);
    expect(run.status).toBe('running');
    expect(run.started_at).not.toBeNull();
  });
});

describe('read runs', () => {
  it('reconciles an active run from the engine snapshot (never trusts the summary alone)', async () => {
    const h = buildWorkflowHarness();
    const { run } = await startTest(h);
    h.gateway.snapshots.set(run.engine_run_id, { ...asSnapshot(snapshotReview), run_id: run.engine_run_id });
    const detail = await new GetWorkflowRunUseCase(h.deps).execute(run.id, ctx());
    expect(detail.engine_reachable).toBe(true);
    expect(detail.run).toMatchObject({ status: 'needs_review', credits_used: 3, last_event_seq: 4 });
    expect(detail.steps.map((s) => [s.step_key, s.status])).toEqual([
      ['reminder', 'done'],
      ['approval', 'needs_review'],
      ['summary', 'waiting'],
    ]);
    expect(detail.steps[1]?.approval_id).toBe('70000000-0000-4000-8000-000000000001');
  });

  it('does not let an older snapshot move a run backwards', async () => {
    const h = buildWorkflowHarness();
    const { run } = await startTest(h);
    await h.runs.advanceSequence(run.workspace_id, run.id, 9);
    h.gateway.snapshots.set(run.engine_run_id, { ...asSnapshot(snapshotReview), run_id: run.engine_run_id });
    const detail = await new GetWorkflowRunUseCase(h.deps).execute(run.id, ctx());
    expect(detail.run.status).toBe('queued');
    expect(detail.run.last_event_seq).toBe(9);
  });

  it('shows the last known state and says so when the engine cannot be reached', async () => {
    const h = buildWorkflowHarness();
    const { run } = await startTest(h);
    h.gateway.failWith = 'unavailable';
    const detail = await new GetWorkflowRunUseCase(h.deps).execute(run.id, ctx());
    expect(detail).toMatchObject({ engine_reachable: false });
    expect(detail.run.status).toBe('queued');
    expect(h.log.warnings.map((w) => w.event)).toContain('workflow.run_reconcile_failed');
  });

  it('does not ask the engine about a finished run', async () => {
    const h = buildWorkflowHarness();
    const { run } = await startTest(h);
    await h.runs.update(run.workspace_id, run.id, { status: 'succeeded' });
    const spy = vi.spyOn(h.gateway, 'getRun');
    const detail = await new GetWorkflowRunUseCase(h.deps).execute(run.id, ctx());
    expect(spy).not.toHaveBeenCalled();
    expect(detail.engine_reachable).toBe(true);
  });

  it('hides step output and trace from roles without workflow.trace.view', async () => {
    const h = buildWorkflowHarness();
    const { run } = await startTest(h);
    h.gateway.snapshots.set(run.engine_run_id, { ...asSnapshot(snapshotReview), run_id: run.engine_run_id });
    const asMember = await new GetWorkflowRunUseCase(h.deps).execute(run.id, memberCtx());
    expect(asMember.can_view_trace).toBe(false);
    expect(asMember.steps.every((s) => s.output_preview === null && s.trace === null)).toBe(true);
    const asAdmin = await new GetWorkflowRunUseCase(h.deps).execute(run.id, ctx());
    expect(asAdmin.can_view_trace).toBe(true);
    expect(asAdmin.steps[0]?.output_preview).toContain('Pak Budi');
  });

  it('answers 404 for a run of another workspace', async () => {
    const h = buildWorkflowHarness();
    const { run } = await startTest(h);
    await expect(
      new GetWorkflowRunUseCase(h.deps).execute(run.id, ctx({ workspace_id: OTHER_WS })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists runs newest first with the workflow name and filters by workflow and mode', async () => {
    const h = buildWorkflowHarness();
    const a = await seedWorkflow(h, { name: 'Penagihan' });
    const b = await seedWorkflow(h, { name: 'Laporan' });
    await startTest(h, { workflow: a });
    await startTest(h, { workflow: b });
    const all = await new ListWorkflowRunsUseCase(h.deps).execute({ page: 1, per_page: 20 }, ctx());
    expect(all.total).toBe(2);
    expect(all.items.map((i) => i.workflow_name)).toEqual(['Laporan', 'Penagihan']);
    const one = await new ListWorkflowRunsUseCase(h.deps).execute({ workflow_id: a.id, mode: 'test', page: 1, per_page: 20 }, ctx());
    expect(one.items.map((i) => i.workflow_name)).toEqual(['Penagihan']);
  });
});

describe('cancel (FR-WF-23)', () => {
  it('cancels through the engine, records it and audits', async () => {
    const h = buildWorkflowHarness();
    const { run } = await startTest(h);
    const cancelled = await new CancelWorkflowRunUseCase(h.deps).execute(run.id, ctx());
    expect(h.gateway.cancelled).toEqual([run.engine_run_id]);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.finished_at).not.toBeNull();
    expect(h.audit.getEvents().map((e) => e.action)).toContain('workflow.run.cancelled');
  });

  it('lets the starter and an admin cancel, not another member', async () => {
    const h = buildWorkflowHarness();
    const { run } = await startTest(h, { context: memberCtx() });
    await expect(new CancelWorkflowRunUseCase(h.deps).execute(run.id, memberCtx(OTHER_MEMBER))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(new CancelWorkflowRunUseCase(h.deps).execute(run.id, memberCtx(MEMBER))).resolves.toMatchObject({ status: 'cancelled' });
    const second = (await startTest(h)).run;
    await expect(new CancelWorkflowRunUseCase(h.deps).execute(second.id, ctx())).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('refuses a run that is already over', async () => {
    const h = buildWorkflowHarness();
    const { run } = await startTest(h);
    await h.runs.update(run.workspace_id, run.id, { status: 'succeeded' });
    await expect(new CancelWorkflowRunUseCase(h.deps).execute(run.id, ctx())).rejects.toBeInstanceOf(WorkflowStateError);
    expect(h.gateway.cancelled).toHaveLength(0);
  });

  it('keeps the run as it is when the engine cannot be reached', async () => {
    const h = buildWorkflowHarness();
    const { run } = await startTest(h);
    h.gateway.failWith = 'unavailable';
    await expect(new CancelWorkflowRunUseCase(h.deps).execute(run.id, ctx())).rejects.toMatchObject({ status: 503 });
    expect((await h.runs.findById(run.workspace_id, run.id))?.status).toBe('queued');
  });
});

describe('resume (FR-WF-26, FR-WF-21)', () => {
  async function failedRun(h: WorkflowHarness, status: 'failed' | 'budget_exceeded' = 'failed', context = ctx()) {
    const { run } = await startTest(h, { context });
    await h.runs.update(run.workspace_id, run.id, { status, error_code: status === 'failed' ? 'step_failed' : 'budget_max_credits', finished_at: '2026-10-23T09:00:30.000Z' });
    return run;
  }

  it('resumes a failed run from its failed step, with an idempotency key, and audits', async () => {
    const h = buildWorkflowHarness();
    const run = await failedRun(h);
    const resumed = await new ResumeWorkflowRunUseCase(h.deps).execute(run.id, { mode: 'from_failed_step' }, ctx());
    expect(h.gateway.resumed).toEqual([{ run_id: run.engine_run_id, mode: 'from_failed_step', key: expect.any(String) }]);
    expect(resumed).toMatchObject({ status: 'running', error_code: null, finished_at: null });
    expect(h.audit.getEvents().map((e) => e.action)).toContain('workflow.run.resumed');
  });

  it('lets only the starter, an admin or the owner resume', async () => {
    const h = buildWorkflowHarness();
    const run = await failedRun(h, 'failed', memberCtx());
    await expect(
      new ResumeWorkflowRunUseCase(h.deps).execute(run.id, { mode: 'from_failed_step' }, memberCtx(OTHER_MEMBER)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      new ResumeWorkflowRunUseCase(h.deps).execute(run.id, { mode: 'from_failed_step' }, memberCtx(MEMBER)),
    ).resolves.toMatchObject({ status: 'running' });
  });

  it('offers resume only for the state it fits', async () => {
    const h = buildWorkflowHarness();
    const { run } = await startTest(h);
    await expect(new ResumeWorkflowRunUseCase(h.deps).execute(run.id, { mode: 'from_failed_step' }, ctx())).rejects.toMatchObject({
      code: 'run_not_resumable',
    });
    const budget = await failedRun(h, 'budget_exceeded');
    await expect(new ResumeWorkflowRunUseCase(h.deps).execute(budget.id, { mode: 'from_failed_step' }, ctx())).rejects.toMatchObject({
      code: 'run_not_resumable',
    });
  });

  it('continues after "Paused: budget reached" only for the Owner (FR-WF-21)', async () => {
    const h = buildWorkflowHarness();
    const run = await failedRun(h, 'budget_exceeded');
    await expect(
      new ResumeWorkflowRunUseCase(h.deps).execute(run.id, { mode: 'continue_after_budget' }, ctx()),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      new ResumeWorkflowRunUseCase(h.deps).execute(run.id, { mode: 'continue_after_budget' }, ownerCtx()),
    ).resolves.toMatchObject({ status: 'running' });
    expect(h.gateway.resumed[0]).toMatchObject({ mode: 'continue_after_budget' });
  });

  it('leaves the run failed when the engine cannot be reached', async () => {
    const h = buildWorkflowHarness();
    const run = await failedRun(h);
    h.gateway.failWith = 'unavailable';
    await expect(new ResumeWorkflowRunUseCase(h.deps).execute(run.id, { mode: 'from_failed_step' }, ctx())).rejects.toMatchObject({ status: 503 });
    expect((await h.runs.findById(run.workspace_id, run.id))?.status).toBe('failed');
  });
});

describe('events pushed by sineva-ai (ADR-0046 point 2)', () => {
  const apply = (h: WorkflowHarness, raw: unknown) => new ApplyWorkflowRunEventUseCase(h.deps).execute(parseEvent(raw), 'req-event');

  it('the proposed fixtures parse with the platform event schema', () => {
    for (const raw of [eventRunStatus, eventSucceeded, eventStepFailed, ...transcript.events]) {
      expect(WorkflowRunEventSchema.safeParse(raw).success).toBe(true);
    }
  });

  it('replays a run in order: steps move, the run ends up needing review, one review audit', async () => {
    const h = buildWorkflowHarness();
    const { run } = await startTest(h);
    for (const raw of transcript.events) {
      expect(await apply(h, raw)).toEqual({ applied: true, duplicate: false });
    }
    const stored = await h.runs.findById(run.workspace_id, run.id);
    expect(stored).toMatchObject({ status: 'needs_review', credits_used: 3, last_event_seq: 6 });
    expect(stored?.started_at).toBe('2026-10-23T09:00:01.000Z');
    const steps = await h.runs.listSteps(run.workspace_id, run.id);
    expect(steps.map((s) => [s.step_key, s.status])).toEqual([
      ['reminder', 'done'],
      ['approval', 'needs_review'],
    ]);
    expect(steps[0]).toMatchObject({ credits: 3, output_preview: 'Halo Pak Budi.' });
    expect(steps[1]?.approval_id).toBe('70000000-0000-4000-8000-000000000001');
    const actions = h.audit.getEvents().map((e) => e.action);
    expect(actions.filter((a) => a === 'workflow.run.review_requested')).toHaveLength(1);
    const review = h.audit.getEvents().find((e) => e.action === 'workflow.run.review_requested');
    expect(review).toMatchObject({
      context: { actor: { type: 'system', id: 'sineva-ai' } },
      workspace_id: run.workspace_id,
      target_resource_type: 'workflow_run',
    });
  });

  it('acknowledges a retried event without applying it twice', async () => {
    const h = buildWorkflowHarness();
    await startTest(h);
    await apply(h, eventRunStatus);
    expect(await apply(h, eventRunStatus)).toEqual({ applied: false, duplicate: true });
  });

  it('ignores a stale sequence but stores that it was said', async () => {
    const h = buildWorkflowHarness();
    const { run } = await startTest(h);
    await apply(h, transcript.events[5]);
    const stale = { ...transcript.events[1]!, event_id: '81000000-0000-4000-8000-0000000000aa' };
    expect(await apply(h, stale)).toEqual({ applied: false, duplicate: false });
    expect(h.runs.events.find((e) => e.event_id === stale.event_id)).toMatchObject({ applied: false, sequence: 2 });
    expect(await h.runs.listSteps(run.workspace_id, run.id)).toHaveLength(0);
  });

  it('takes a higher sequence even when earlier ones were missed (the poll closes the gap)', async () => {
    const h = buildWorkflowHarness();
    const { run } = await startTest(h);
    await apply(h, transcript.events[5]);
    expect((await h.runs.findById(run.workspace_id, run.id))?.status).toBe('needs_review');
  });

  it('a finished test run unlocks publish end to end, and audits completion', async () => {
    const h = buildWorkflowHarness();
    const { workflow, run } = await startTest(h);
    await apply(h, eventSucceeded);
    expect(await h.runs.findById(run.workspace_id, run.id)).toMatchObject({ status: 'succeeded', credits_used: 5, finished_at: '2026-10-23T09:03:00.000Z' });
    expect(h.audit.getEvents().map((e) => e.action)).toContain('workflow.run.completed');
    await expect(new PublishWorkflowUseCase(h.deps).execute(workflow.id, {}, ctx())).resolves.toMatchObject({ version: { version_number: 1 } });
  });

  it('records a failed step and a failed run with their codes and audits workflow.run.failed', async () => {
    const h = buildWorkflowHarness();
    const { run } = await startTest(h);
    await apply(h, eventStepFailed);
    const failedRun = {
      ...eventRunStatus,
      event_id: '80000000-0000-4000-8000-0000000000f1',
      sequence: 4,
      data: { status: 'failed', credits_used: 0, error_code: 'step_failed', started_at: null, finished_at: '2026-10-23T09:00:30.000Z' },
    };
    await apply(h, failedRun);
    expect(await h.runs.findById(run.workspace_id, run.id)).toMatchObject({ status: 'failed', error_code: 'step_failed' });
    expect((await h.runs.listSteps(run.workspace_id, run.id))[0]).toMatchObject({ status: 'failed', error_code: 'upstream_unavailable', attempt: 3 });
    const failed = h.audit.getEvents().find((e) => e.action === 'workflow.run.failed');
    expect(failed).toMatchObject({ reason_code: 'step_failed' });
  });

  it('audits an engine-side cancel once', async () => {
    const h = buildWorkflowHarness();
    await startTest(h);
    const cancelled = { ...eventRunStatus, sequence: 2, event_id: '80000000-0000-4000-8000-0000000000c1', data: { status: 'cancelled', credits_used: 0, error_code: null, started_at: null, finished_at: null } };
    await apply(h, cancelled);
    expect(h.audit.getEvents().filter((e) => e.action === 'workflow.run.cancelled')).toHaveLength(1);
  });

  it('answers 404 for another tenant or an unknown run, so a forged id probes nothing', async () => {
    const h = buildWorkflowHarness();
    await startTest(h);
    await expect(apply(h, { ...eventRunStatus, tenant_id: OTHER_WS })).rejects.toBeInstanceOf(NotFoundError);
    await expect(apply(h, { ...eventRunStatus, run_id: '60000000-0000-4000-8000-0000000000ee' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('keeps snapshot state in sync with event state (same words)', () => {
    expect(asSnapshot(snapshotFailed).steps[0]?.status).toBe('failed');
    expect(asSnapshot(snapshotSucceeded).status).toBe('succeeded');
  });
});
