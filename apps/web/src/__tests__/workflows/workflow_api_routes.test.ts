import { installHeaderSessionResolver } from '../fakes/header_session_resolver';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as eventsRoute from '@/app/api/internal/v1/workflow-runs/events/route';
import * as archiveRoute from '@/app/api/v1/workspaces/[workspace_id]/workflows/[workflow_id]/archive/route';
import * as catalogRoute from '@/app/api/v1/workspaces/[workspace_id]/workflow-catalog/route';
import * as publishRoute from '@/app/api/v1/workspaces/[workspace_id]/workflows/[workflow_id]/publish/route';
import * as restoreRoute from '@/app/api/v1/workspaces/[workspace_id]/workflows/[workflow_id]/restore/[version_id]/route';
import * as cancelRoute from '@/app/api/v1/workspaces/[workspace_id]/workflow-runs/[run_id]/cancel/route';
import * as resumeRoute from '@/app/api/v1/workspaces/[workspace_id]/workflow-runs/[run_id]/resume/route';
import * as runRoute from '@/app/api/v1/workspaces/[workspace_id]/workflow-runs/[run_id]/route';
import * as runsRoute from '@/app/api/v1/workspaces/[workspace_id]/workflow-runs/route';
import * as startRoute from '@/app/api/v1/workspaces/[workspace_id]/workflows/[workflow_id]/runs/route';
import * as templatesRoute from '@/app/api/v1/workspaces/[workspace_id]/workflow-templates/route';
import * as useTemplateRoute from '@/app/api/v1/workspaces/[workspace_id]/workflow-templates/[slug]/use/route';
import * as versionsRoute from '@/app/api/v1/workspaces/[workspace_id]/workflows/[workflow_id]/versions/route';
import * as workflowRoute from '@/app/api/v1/workspaces/[workspace_id]/workflows/[workflow_id]/route';
import * as workflowsRoute from '@/app/api/v1/workspaces/[workspace_id]/workflows/route';
import { ApplyWorkflowRunEventUseCase } from '@/server/application/use-cases/workflows/apply_workflow_run_event_use_case';
import { ArchiveWorkflowUseCase } from '@/server/application/use-cases/workflows/archive_workflow_use_case';
import { CancelWorkflowRunUseCase } from '@/server/application/use-cases/workflows/cancel_workflow_run_use_case';
import { CreateWorkflowUseCase } from '@/server/application/use-cases/workflows/create_workflow_use_case';
import { DeleteWorkflowUseCase } from '@/server/application/use-cases/workflows/delete_workflow_use_case';
import { GetWorkflowCatalogUseCase } from '@/server/application/use-cases/workflows/get_workflow_catalog_use_case';
import { GetWorkflowRunUseCase } from '@/server/application/use-cases/workflows/get_workflow_run_use_case';
import { GetWorkflowUseCase } from '@/server/application/use-cases/workflows/get_workflow_use_case';
import { ListWorkflowRunsUseCase } from '@/server/application/use-cases/workflows/list_workflow_runs_use_case';
import { ListWorkflowTemplatesUseCase } from '@/server/application/use-cases/workflows/list_workflow_templates_use_case';
import { ListWorkflowVersionsUseCase } from '@/server/application/use-cases/workflows/list_workflow_versions_use_case';
import { ListWorkflowsUseCase } from '@/server/application/use-cases/workflows/list_workflows_use_case';
import { PublishWorkflowUseCase } from '@/server/application/use-cases/workflows/publish_workflow_use_case';
import { RestoreWorkflowVersionUseCase } from '@/server/application/use-cases/workflows/restore_workflow_version_use_case';
import { ResumeWorkflowRunUseCase } from '@/server/application/use-cases/workflows/resume_workflow_run_use_case';
import { StartWorkflowRunUseCase } from '@/server/application/use-cases/workflows/start_workflow_run_use_case';
import { UpdateWorkflowDraftUseCase } from '@/server/application/use-cases/workflows/update_workflow_draft_use_case';
import { UseWorkflowTemplateUseCase } from '@/server/application/use-cases/workflows/use_workflow_template_use_case';
import * as container from '@/server/container';
import * as envModule from '@/server/infrastructure/config/env';
import snapshotReview from '../contract/fixtures/workflow_run_snapshot_needs_review.json';
import eventRunStatus from '../contract/fixtures/workflow_run_event_run_status.json';
import { OTHER_WS, WS, buildWorkflowHarness, passTestRun, seedWorkflow, simpleDefinition, type WorkflowHarness } from '../workflow_harness';

installHeaderSessionResolver();

const WF = '99999999-9999-4999-8999-999999999999';
const RUN = '88888888-8888-4888-8888-888888888888';
const VERSION = '77777777-7777-4777-8777-777777777777';
const base = (workspace = WS) => `https://app.sineva.id/api/v1/workspaces/${workspace}`;

// Route handlers differ only in their params type; the tests pass whatever the URL implies.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (request: NextRequest, context: any) => Promise<Response>;

interface RouteCase {
  name: string;
  handler: RouteHandler;
  method: string;
  path: string;
  body?: unknown;
  /** The lowest-privilege role that must be refused, or null when every role may call it. */
  deniedRole: 'viewer' | 'member' | null;
}

const CASES: RouteCase[] = [
  { name: 'GET workflows', handler: workflowsRoute.GET, method: 'GET', path: '/workflows', deniedRole: null },
  { name: 'POST workflows', handler: workflowsRoute.POST, method: 'POST', path: '/workflows', body: { name: 'x' }, deniedRole: 'viewer' },
  { name: 'GET workflow', handler: workflowRoute.GET, method: 'GET', path: `/workflows/${WF}`, deniedRole: null },
  { name: 'PATCH workflow', handler: workflowRoute.PATCH, method: 'PATCH', path: `/workflows/${WF}`, body: { name: 'y', expected_revision: 1 }, deniedRole: 'viewer' },
  { name: 'DELETE workflow', handler: workflowRoute.DELETE, method: 'DELETE', path: `/workflows/${WF}`, deniedRole: 'member' },
  { name: 'GET versions', handler: versionsRoute.GET, method: 'GET', path: `/workflows/${WF}/versions`, deniedRole: null },
  { name: 'POST publish', handler: publishRoute.POST, method: 'POST', path: `/workflows/${WF}/publish`, body: {}, deniedRole: 'member' },
  { name: 'POST archive', handler: archiveRoute.POST, method: 'POST', path: `/workflows/${WF}/archive`, deniedRole: 'member' },
  { name: 'POST restore', handler: restoreRoute.POST, method: 'POST', path: `/workflows/${WF}/restore/${VERSION}`, body: {}, deniedRole: 'member' },
  { name: 'POST start run', handler: startRoute.POST, method: 'POST', path: `/workflows/${WF}/runs`, body: { mode: 'test' }, deniedRole: 'viewer' },
  { name: 'GET templates', handler: templatesRoute.GET, method: 'GET', path: '/workflow-templates', deniedRole: null },
  { name: 'POST use template', handler: useTemplateRoute.POST, method: 'POST', path: '/workflow-templates/lead_to_proposal/use', body: {}, deniedRole: 'viewer' },
  { name: 'GET catalog', handler: catalogRoute.GET, method: 'GET', path: '/workflow-catalog', deniedRole: null },
  { name: 'GET runs', handler: runsRoute.GET, method: 'GET', path: '/workflow-runs', deniedRole: null },
  { name: 'GET run', handler: runRoute.GET, method: 'GET', path: `/workflow-runs/${RUN}`, deniedRole: null },
  { name: 'POST cancel', handler: cancelRoute.POST, method: 'POST', path: `/workflow-runs/${RUN}/cancel`, deniedRole: 'viewer' },
  { name: 'POST resume', handler: resumeRoute.POST, method: 'POST', path: `/workflow-runs/${RUN}/resume`, body: { mode: 'from_failed_step' }, deniedRole: 'viewer' },
];

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-test-session-user-id': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'x-test-session-role': 'admin',
    'x-test-session-workspaces': WS,
    ...extra,
  };
}

const PARAM_NAMES: Record<string, string> = {
  workflows: 'workflow_id',
  'workflow-runs': 'run_id',
  'workflow-templates': 'slug',
};

function call(
  handler: RouteCase['handler'],
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string>; workspace?: string } = {},
) {
  const workspace = options.workspace ?? WS;
  const segments = path.split('/').filter(Boolean);
  const params: Record<string, string> = { workspace_id: workspace };
  const key = segments[0] ? PARAM_NAMES[segments[0]] : undefined;
  if (key && segments[1]) params[key] = segments[1];
  if (segments[2] === 'restore' && segments[3]) params.version_id = segments[3];
  const request = new NextRequest(`${base(workspace)}${path}`, {
    method,
    headers: headers(options.headers),
    ...(options.body !== undefined ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) } : {}),
  });
  return handler(request, { params: Promise.resolve(params) });
}

let h: WorkflowHarness;

beforeEach(() => {
  vi.restoreAllMocks();
  h = buildWorkflowHarness();
  const deps = h.deps;
  const spies: Array<[keyof typeof container, unknown]> = [
    ['getCreateWorkflowUseCase', new CreateWorkflowUseCase(deps)],
    ['getListWorkflowsUseCase', new ListWorkflowsUseCase(deps)],
    ['getGetWorkflowUseCase', new GetWorkflowUseCase(deps)],
    ['getUpdateWorkflowDraftUseCase', new UpdateWorkflowDraftUseCase(deps)],
    ['getPublishWorkflowUseCase', new PublishWorkflowUseCase(deps)],
    ['getListWorkflowVersionsUseCase', new ListWorkflowVersionsUseCase(deps)],
    ['getRestoreWorkflowVersionUseCase', new RestoreWorkflowVersionUseCase(deps)],
    ['getArchiveWorkflowUseCase', new ArchiveWorkflowUseCase(deps)],
    ['getDeleteWorkflowUseCase', new DeleteWorkflowUseCase(deps)],
    ['getListWorkflowTemplatesUseCase', new ListWorkflowTemplatesUseCase(deps)],
    ['getUseWorkflowTemplateUseCase', new UseWorkflowTemplateUseCase(deps)],
    ['getGetWorkflowCatalogUseCase', new GetWorkflowCatalogUseCase(deps)],
    ['getStartWorkflowRunUseCase', new StartWorkflowRunUseCase(deps)],
    ['getGetWorkflowRunUseCase', new GetWorkflowRunUseCase(deps)],
    ['getListWorkflowRunsUseCase', new ListWorkflowRunsUseCase(deps)],
    ['getCancelWorkflowRunUseCase', new CancelWorkflowRunUseCase(deps)],
    ['getResumeWorkflowRunUseCase', new ResumeWorkflowRunUseCase(deps)],
    ['getApplyWorkflowRunEventUseCase', new ApplyWorkflowRunEventUseCase(deps)],
  ];
  for (const [name, useCase] of spies) {
    vi.spyOn(container, name as never).mockReturnValue(useCase as never);
  }
});

describe.each(CASES)('$name: guards (401, 403, cross-workspace 404)', (route) => {
  it('returns 401 without a session', async () => {
    const res = await call(route.handler, route.method, route.path, {
      body: route.body,
      headers: { 'x-test-unauthenticated': 'true' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 for a workspace the caller is not a member of, never 403', async () => {
    const res = await call(route.handler, route.method, route.path, { body: route.body, workspace: OTHER_WS });
    expect(res.status).toBe(404);
  });

  if (route.deniedRole) {
    it(`returns 403 for the ${route.deniedRole} role`, async () => {
      const res = await call(route.handler, route.method, route.path, {
        body: route.body,
        headers: { 'x-test-session-role': route.deniedRole! },
      });
      expect(res.status).toBe(403);
    });
  }
});

describe('the Workflow API end to end', () => {
  it('creates a draft (201) without exposing the definition in the list shape', async () => {
    const res = await call(workflowsRoute.POST, 'POST', '/workflows', { body: { name: 'Weekly report' } });
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.data).toMatchObject({ name: 'Weekly report', status: 'draft', draft_revision: 1, step_count: 0 });
    expect(JSON.stringify(json)).not.toContain('draft_definition');

    const list = await (await call(workflowsRoute.GET, 'GET', '/workflows')).json();
    expect(list.data.items.map((i: { name: string }) => i.name)).toEqual(['Weekly report']);
    expect(list.data.total).toBe(1);
  });

  it('answers 422 for a bad body, an unknown key and a bad query', async () => {
    expect((await call(workflowsRoute.POST, 'POST', '/workflows', { body: { name: '' } })).status).toBe(422);
    expect((await call(workflowsRoute.POST, 'POST', '/workflows', { body: { name: 'x', tenant_id: 'y' } })).status).toBe(422);
    expect((await call(workflowsRoute.GET, 'GET', '/workflows?status=bogus')).status).toBe(422);
    expect((await call(workflowRoute.PATCH, 'PATCH', `/workflows/${WF}`, { body: { name: 'x' } })).status).toBe(422);
  });

  it('serves the detail with issues, then 409 draft_conflict for a stale save and 404 for a stranger', async () => {
    const workflow = await seedWorkflow(h);
    const detail = await (await call(workflowRoute.GET, 'GET', `/workflows/${workflow.id}`)).json();
    expect(detail.data).toMatchObject({ id: workflow.id, tested_current_draft: false, catalog_known: true, issues: [] });
    expect(detail.data.definition.steps).toHaveLength(1);

    const saved = await call(workflowRoute.PATCH, 'PATCH', `/workflows/${workflow.id}`, {
      body: { definition: simpleDefinition(), expected_revision: 1 },
    });
    expect(saved.status).toBe(200);
    expect((await saved.json()).data.draft_revision).toBe(2);
    const stale = await call(workflowRoute.PATCH, 'PATCH', `/workflows/${workflow.id}`, {
      body: { definition: simpleDefinition(), expected_revision: 1 },
    });
    expect(stale.status).toBe(409);
    expect((await stale.json()).errors[0]).toMatchObject({ code: 'draft_conflict', detail: '2' });

    expect((await call(workflowRoute.GET, 'GET', `/workflows/${WF}`)).status).toBe(404);
  });

  it('publish answers 409 test_run_required, then 201 after a passed test, and lists the version', async () => {
    const workflow = await seedWorkflow(h);
    const early = await call(publishRoute.POST, 'POST', `/workflows/${workflow.id}/publish`, { body: { note: 'First' } });
    expect(early.status).toBe(409);
    expect((await early.json()).errors[0].code).toBe('test_run_required');

    await passTestRun(h, workflow);
    const ok = await call(publishRoute.POST, 'POST', `/workflows/${workflow.id}/publish`, { body: { note: 'First' } });
    const json = await ok.json();
    expect(ok.status).toBe(201);
    expect(json.data).toMatchObject({ version: { version_number: 1, note: 'First' }, workflow: { status: 'published', version: 1 } });

    const versions = await (await call(versionsRoute.GET, 'GET', `/workflows/${workflow.id}/versions`)).json();
    expect(versions.data.items).toHaveLength(1);
  });

  it('publish answers 422 workflow_invalid with the issue codes', async () => {
    const workflow = await seedWorkflow(h, {
      definition: simpleDefinition({
        steps: [{ key: 'a', type: 'specialist_task', title: 'A', specialist: 'sinosales', instruction: 'x', output_type: 'text' }],
        inputs: [],
      }),
    });
    await passTestRun(h, workflow);
    h.catalog.specialists = ['sinofinance'];
    const res = await call(publishRoute.POST, 'POST', `/workflows/${workflow.id}/publish`, { body: {} });
    expect(res.status).toBe(422);
    expect((await res.json()).errors[0]).toMatchObject({ code: 'specialist_not_enabled', field: 'steps[0].specialist' });
  });

  it('delete answers 409 workflow_has_runs and archive keeps the history', async () => {
    const workflow = await seedWorkflow(h);
    await passTestRun(h, workflow);
    const del = await call(workflowRoute.DELETE, 'DELETE', `/workflows/${workflow.id}`);
    expect(del.status).toBe(409);
    expect((await del.json()).errors[0].code).toBe('workflow_has_runs');
    const archived = await call(archiveRoute.POST, 'POST', `/workflows/${workflow.id}/archive`);
    expect(archived.status).toBe(200);
    expect((await archived.json()).data.status).toBe('archived');
  });

  it('lists templates and makes a draft from one', async () => {
    const list = await (await call(templatesRoute.GET, 'GET', '/workflow-templates?locale=id')).json();
    expect(list.data.items).toHaveLength(5);
    expect(list.data.items[0].name).toBe('Penagihan faktur jatuh tempo');
    const used = await call(useTemplateRoute.POST, 'POST', '/workflow-templates/month_end_owner_pack/use', { body: { locale: 'en' } });
    expect(used.status).toBe(201);
    expect((await used.json()).data).toMatchObject({ status: 'draft', template_slug: 'month_end_owner_pack', version: null });
    expect((await call(useTemplateRoute.POST, 'POST', '/workflow-templates/nope/use', { body: {} })).status).toBe(404);
  });

  it('serves the builder catalog, honestly empty of connections', async () => {
    const json = await (await call(catalogRoute.GET, 'GET', '/workflow-catalog')).json();
    expect(json.data).toMatchObject({ connections: [], actions: [] });
    expect(json.data.enabled_specialists).toContain('sinofinance');
  });

  describe('runs', () => {
    it('starts a run (201) and answers 422 for a missing required input', async () => {
      const workflow = await seedWorkflow(h);
      const res = await call(startRoute.POST, 'POST', `/workflows/${workflow.id}/runs`, { body: { mode: 'test', inputs: { days: 14 } } });
      expect(res.status).toBe(201);
      expect((await res.json()).data).toMatchObject({ mode: 'test', status: 'queued', trigger_type: 'manual' });

      const required = await seedWorkflow(h, {
        definition: simpleDefinition({ inputs: [{ key: 'days', type: 'number', label: 'Days', required: true }] }),
      });
      const bad = await call(startRoute.POST, 'POST', `/workflows/${required.id}/runs`, { body: { mode: 'test' } });
      expect(bad.status).toBe(422);
      expect((await bad.json()).errors[0]).toMatchObject({ code: 'input_required', field: 'inputs.days' });
    });

    it('answers 503 workflow_engine_unavailable with no run behind it when sineva-ai is down', async () => {
      h.gateway.failWith = 'unavailable';
      const workflow = await seedWorkflow(h);
      const res = await call(startRoute.POST, 'POST', `/workflows/${workflow.id}/runs`, { body: { mode: 'test' } });
      const json = await res.json();
      expect(res.status).toBe(503);
      expect(json.errors[0].code).toBe('workflow_engine_unavailable');
      const runs = await (await call(runsRoute.GET, 'GET', '/workflow-runs')).json();
      expect(runs.data.items).toEqual([]);
    });

    it('answers 409 not_published for a live run before the first publish', async () => {
      const workflow = await seedWorkflow(h);
      const res = await call(startRoute.POST, 'POST', `/workflows/${workflow.id}/runs`, { body: { mode: 'live' } });
      expect(res.status).toBe(409);
      expect((await res.json()).errors[0].code).toBe('not_published');
    });

    it('serves the run with its plan and steps, and keeps step output from a Member', async () => {
      const workflow = await seedWorkflow(h);
      const started = await (await call(startRoute.POST, 'POST', `/workflows/${workflow.id}/runs`, { body: { mode: 'test' } })).json();
      const run = [...h.runs.rows.values()][0]!;
      h.gateway.snapshots.set(run.engine_run_id, { ...(snapshotReview as { data: never }).data, run_id: run.engine_run_id });

      const admin = await (await call(runRoute.GET, 'GET', `/workflow-runs/${started.data.id}`)).json();
      expect(admin.data).toMatchObject({ status: 'needs_review', engine_reachable: true, workflow_name: 'Penagihan' });
      expect(admin.data.plan[0]).toMatchObject({ key: 'summary', type: 'specialist_task', specialist: 'sinofinance' });
      expect(admin.data.steps[0].output_preview).toContain('Pak Budi');

      const member = await (
        await call(runRoute.GET, 'GET', `/workflow-runs/${started.data.id}`, { headers: { 'x-test-session-role': 'member' } })
      ).json();
      expect(member.data.steps.every((s: { output_preview: unknown; trace: unknown }) => s.output_preview === null && s.trace === null)).toBe(true);
      expect(JSON.stringify(member)).not.toContain('Pak Budi');
      expect(JSON.stringify(member)).not.toContain('Summarize the last');
    });

    it('cancel and resume answer the state errors as 409', async () => {
      const workflow = await seedWorkflow(h);
      const started = await (await call(startRoute.POST, 'POST', `/workflows/${workflow.id}/runs`, { body: { mode: 'test' } })).json();
      const resume = await call(resumeRoute.POST, 'POST', `/workflow-runs/${started.data.id}/resume`, { body: { mode: 'from_failed_step' } });
      expect(resume.status).toBe(409);
      expect((await resume.json()).errors[0].code).toBe('run_not_resumable');
      const cancel = await call(cancelRoute.POST, 'POST', `/workflow-runs/${started.data.id}/cancel`);
      expect(cancel.status).toBe(200);
      expect((await cancel.json()).data.status).toBe('cancelled');
      expect((await call(cancelRoute.POST, 'POST', `/workflow-runs/${started.data.id}/cancel`)).status).toBe(409);
    });
  });
});

describe('POST /api/internal/v1/workflow-runs/events', () => {
  const KEY = 'test-secret-key-primary';
  beforeEach(() => {
    vi.spyOn(envModule, 'getEnvConfig').mockReturnValue({
      ai_engine_internal_api_key: KEY,
      ai_engine_internal_api_key_next: 'test-secret-key-secondary',
    } as ReturnType<typeof envModule.getEnvConfig>);
  });
  const request = (body: unknown, key: string | null = KEY) =>
    new NextRequest('http://localhost:3000/api/internal/v1/workflow-runs/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { 'x-internal-api-key': key } : {}) },
      body: JSON.stringify(body),
    });

  it('rejects a missing or wrong internal key with 401 and changes nothing', async () => {
    const workflow = await seedWorkflow(h);
    await new StartWorkflowRunUseCase(h.deps).execute(workflow.id, { mode: 'test', inputs: {} }, {
      user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', workspace_id: WS, session_id: 's', request_id: 'r', role: 'admin',
    });
    expect((await eventsRoute.POST(request(eventRunStatus, null))).status).toBe(401);
    expect((await eventsRoute.POST(request(eventRunStatus, 'wrong'))).status).toBe(401);
    expect([...h.runs.rows.values()][0]?.status).toBe('queued');
  });

  it('applies an event, acknowledges a retry, and answers 404 for another tenant', async () => {
    const workflow = await seedWorkflow(h);
    await new StartWorkflowRunUseCase(h.deps).execute(workflow.id, { mode: 'test', inputs: {} }, {
      user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', workspace_id: WS, session_id: 's', request_id: 'r', role: 'admin',
    });
    const first = await eventsRoute.POST(request(eventRunStatus));
    expect(first.status).toBe(200);
    expect((await first.json()).data).toEqual({ applied: true, duplicate: false });
    expect([...h.runs.rows.values()][0]?.status).toBe('running');
    expect((await (await eventsRoute.POST(request(eventRunStatus))).json()).data).toEqual({ applied: false, duplicate: true });
    expect((await eventsRoute.POST(request({ ...eventRunStatus, tenant_id: OTHER_WS }))).status).toBe(404);
    expect((await eventsRoute.POST(request({ ...eventRunStatus, type: 'nonsense' }))).status).toBe(422);
  });
});
