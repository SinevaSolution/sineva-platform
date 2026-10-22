import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpstreamServiceError, UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import { InternalWorkflowRunGateway } from '@/server/infrastructure/gateways/internal_workflow_run_gateway';
import {
  envelope,
  runAcceptedSchema,
  runSnapshotSchema,
} from '@/server/infrastructure/gateways/workflow_run_schemas';
import { validateWorkflowDefinition } from '@/shared/workflows/validate';
import accepted from './fixtures/workflow_run_accepted.json';
import cancelResponse from './fixtures/workflow_run_cancel_response.json';
import requestLive from './fixtures/workflow_run_request_live.json';
import requestTest from './fixtures/workflow_run_request_test.json';
import resumeRequest from './fixtures/workflow_run_resume_request.json';
import resumeResponse from './fixtures/workflow_run_resume_response.json';
import snapshotBudget from './fixtures/workflow_run_snapshot_budget_exceeded.json';
import snapshotFailed from './fixtures/workflow_run_snapshot_failed_step.json';
import snapshotReview from './fixtures/workflow_run_snapshot_needs_review.json';
import snapshotSucceeded from './fixtures/workflow_run_snapshot_succeeded.json';

// Contract proposed by the platform, pending sineva-ai (ADR-0046). The fixtures
// are the contract: sineva-ai is expected to answer exactly these shapes. The
// fake upstream answers from them, so the platform is tested against the
// contract and not against an invented stand-in.

const AI_URL = 'http://sineva-ai.test:8000';
const AI_KEY = 'test_internal_key';
const CALL = { context_token: 'test.signed.jws', request_id: 'req-workflow-1' };
const RUN = requestTest.run_id;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Recorded = { url: URL; method: string; headers: Headers; body: unknown };

function fakeUpstream(respond: (call: Recorded) => Response | Promise<Response>) {
  const calls: Recorded[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call: Recorded = {
        url: new URL(url),
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      return respond(call);
    }),
  );
  return calls;
}

describe('workflow run fixtures are valid (proposed by the platform, pending sineva-ai)', () => {
  it.each([
    ['workflow_run_accepted', accepted, runAcceptedSchema],
    ['workflow_run_cancel_response', cancelResponse, runAcceptedSchema],
    ['workflow_run_resume_response', resumeResponse, runAcceptedSchema],
    ['workflow_run_snapshot_needs_review', snapshotReview, runSnapshotSchema],
    ['workflow_run_snapshot_succeeded', snapshotSucceeded, runSnapshotSchema],
    ['workflow_run_snapshot_failed_step', snapshotFailed, runSnapshotSchema],
    ['workflow_run_snapshot_budget_exceeded', snapshotBudget, runSnapshotSchema],
  ])('%s parses inside the success envelope', (_name, fixture, schema) => {
    expect(envelope(schema).safeParse(fixture).success).toBe(true);
  });

  it.each([
    ['test', requestTest],
    ['live', requestLive],
  ])('the %s request carries a definition the shared validator accepts', (_name, fixture) => {
    expect(validateWorkflowDefinition(fixture.definition, { actions: {} }).issues).toEqual([]);
  });

  it('keeps identity out of the request body: tenant and user come from the signed context', () => {
    for (const fixture of [requestTest, requestLive]) {
      expect(Object.keys(fixture)).not.toContain('tenant_id');
      expect(Object.keys(fixture)).not.toContain('user_id');
    }
  });

  it('a test run of a draft pins no version and a live run pins one', () => {
    expect(requestTest).toMatchObject({ mode: 'test', version_number: null, definition_revision: 3 });
    expect(requestLive).toMatchObject({ mode: 'live', version_number: 2, definition_revision: null });
  });
});

describe('InternalWorkflowRunGateway against the fixtures', () => {
  beforeEach(() => {
    vi.stubEnv('AI_ENGINE_INTERNAL_URL', AI_URL);
    vi.stubEnv('AI_ENGINE_INTERNAL_API_KEY', AI_KEY);
    vi.stubEnv('AI_ENGINE_TIMEOUT_MS', '15000');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  const gateway = () => new InternalWorkflowRunGateway();

  it('startRun posts the fixture with the internal key, context and the run id as idempotency key', async () => {
    const calls = fakeUpstream(() => json(accepted, 202));
    const result = await gateway().startRun(requestTest as Parameters<InternalWorkflowRunGateway['startRun']>[0], CALL);

    expect(result).toEqual({ run_id: RUN, status: 'queued' });
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url.href).toBe(`${AI_URL}/api/v2/runs`);
    expect(calls[0]?.body).toEqual(requestTest);
    expect(calls[0]?.headers.get('x-internal-api-key')).toBe(AI_KEY);
    expect(calls[0]?.headers.get('x-sineva-context')).toBe(CALL.context_token);
    expect(calls[0]?.headers.get('x-request-id')).toBe(CALL.request_id);
    expect(calls[0]?.headers.get('idempotency-key')).toBe(RUN);
    expect(calls[0]?.headers.get('traceparent')).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it('getRun reads the authoritative snapshot of each state', async () => {
    for (const [fixture, expected] of [
      [snapshotReview, { status: 'needs_review', last_sequence: 4 }],
      [snapshotSucceeded, { status: 'succeeded', credits_used: 5 }],
      [snapshotFailed, { status: 'failed', error_code: 'step_failed' }],
      [snapshotBudget, { status: 'budget_exceeded', error_code: 'budget_max_credits' }],
    ] as const) {
      const calls = fakeUpstream(() => json(fixture));
      const snapshot = await gateway().getRun(RUN, CALL);
      expect(calls[0]?.method).toBe('GET');
      expect(calls[0]?.url.pathname).toBe(`/api/v2/runs/${RUN}`);
      expect(snapshot).toMatchObject(expected);
    }
  });

  it('cancelRun posts to the cancel path', async () => {
    const calls = fakeUpstream(() => json(cancelResponse));
    expect(await gateway().cancelRun(RUN, CALL)).toEqual({ run_id: RUN, status: 'cancelled' });
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url.pathname).toBe(`/api/v2/runs/${RUN}/cancel`);
  });

  it('resumeRun sends the mode and an idempotency key', async () => {
    const calls = fakeUpstream(() => json(resumeResponse, 202));
    expect(await gateway().resumeRun(RUN, resumeRequest as { mode: 'from_failed_step' }, 'key-1', CALL)).toEqual({
      run_id: RUN,
      status: 'running',
    });
    expect(calls[0]?.url.pathname).toBe(`/api/v2/runs/${RUN}/resume`);
    expect(calls[0]?.body).toEqual(resumeRequest);
    expect(calls[0]?.headers.get('idempotency-key')).toBe('key-1');
  });

  it('answers 503 when sineva-ai cannot be reached, with no stand-in data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    await expect(gateway().startRun(requestTest as never, CALL)).rejects.toMatchObject({
      status: 503,
      code: 'workflow_engine_unavailable',
    });
    await expect(gateway().startRun(requestTest as never, CALL)).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('answers 503 for an upstream 503 and keeps its machine code', async () => {
    fakeUpstream(() => json({ success: false, errors: [{ code: 'engine_draining' }] }, 503));
    await expect(gateway().getRun(RUN, CALL)).rejects.toMatchObject({ status: 503, code: 'engine_draining' });
  });

  it('answers 502 for a rejected request and never copies upstream text', async () => {
    fakeUpstream(() => json({ success: false, message: 'secret internal detail', errors: [{ code: 'bad_definition' }] }, 422));
    const error = await gateway().startRun(requestTest as never, CALL).catch((e) => e);
    expect(error).toBeInstanceOf(UpstreamServiceError);
    expect(error).toMatchObject({ status: 502, code: 'bad_definition' });
    expect(String(error.message)).not.toContain('secret');
  });

  it('answers 502 for a body that is not the contract', async () => {
    fakeUpstream(() => json({ success: true, data: { run_id: RUN, status: 'exploded' } }, 202));
    await expect(gateway().startRun(requestTest as never, CALL)).rejects.toMatchObject({ status: 502 });
    fakeUpstream(() => new Response('<html>', { status: 200 }));
    await expect(gateway().getRun(RUN, CALL)).rejects.toMatchObject({ status: 502 });
  });

  it('refuses an answer about another run', async () => {
    fakeUpstream(() => json({ ...accepted, data: { ...accepted.data, run_id: '60000000-0000-4000-8000-0000000000ff' } }, 202));
    await expect(gateway().startRun(requestTest as never, CALL)).rejects.toMatchObject({ status: 502 });
    fakeUpstream(() => json(snapshotSucceeded));
    await expect(gateway().getRun('60000000-0000-4000-8000-0000000000ff', CALL)).rejects.toMatchObject({ status: 502 });
  });
});
