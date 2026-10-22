import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  approvalRequiredEventSchema,
  createApprovalRequestSchema,
  createInputRequestRequestSchema,
  inputRequiredEventSchema,
  resumeRunBodySchema,
} from '@/server/application/dtos/approval_contract_dto';
import { hashPayload } from '@/server/domain/approvals/action_types';
import {
  UpstreamServiceError,
  UpstreamUnavailableError,
} from '@/server/domain/errors/domain_error';
import type { ResumeRunBody } from '@/server/domain/repositories/ai_engine_gateway';
import { InternalAiEngineGateway } from '@/server/infrastructure/gateways/internal_ai_engine_gateway';
import approvalCreate from './fixtures/approval_create_request.json';
import approvalEvent from './fixtures/approval_required_event.json';
import inputCreate from './fixtures/approval_input_create_request.json';
import inputEvent from './fixtures/approval_input_required_event.json';
import inputAnswered from './fixtures/approval_input_resume_request_answered.json';
import inputDismissed from './fixtures/approval_input_resume_request_dismissed.json';
import resumeApproved from './fixtures/approval_resume_request_approved.json';
import resumeApprovedEdited from './fixtures/approval_resume_request_approved_edited.json';
import resumeChanges from './fixtures/approval_resume_request_changes_requested.json';
import resumeExpired from './fixtures/approval_resume_request_expired.json';
import resumeRejected from './fixtures/approval_resume_request_rejected.json';

// The approval_*.json fixtures are proposed by the platform and pending
// sineva-ai (see fixtures/README.md). These tests pin the platform side.

const AI_URL = 'http://sineva-ai.test:8000';
const AI_KEY = 'test_internal_key';
const UPSTREAM_RUN = '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e';

describe('approval contract fixtures (proposed, WP-M1-40)', () => {
  it('parses the approval_required event and the internal create body', () => {
    expect(approvalRequiredEventSchema.safeParse(approvalEvent).success).toBe(true);
    expect(createApprovalRequestSchema.safeParse(approvalCreate).success).toBe(true);
  });

  it('parses the input_required event and the internal create body', () => {
    expect(inputRequiredEventSchema.safeParse(inputEvent).success).toBe(true);
    expect(createInputRequestRequestSchema.safeParse(inputCreate).success).toBe(true);
  });

  it('refuses identity keys the platform must derive itself', () => {
    expect(createApprovalRequestSchema.safeParse({ ...approvalCreate, user_id: 'usr-x' }).success).toBe(false);
    expect(createInputRequestRequestSchema.safeParse({ ...inputCreate, user_id: 'usr-x' }).success).toBe(false);
  });

  it('keeps the create body equal to the event plus its scope', () => {
    const { workspace_id: _w, run_id: _r, ...rest } = approvalCreate;
    expect(rest).toEqual(approvalEvent);
  });

  it('parses every resume body', () => {
    for (const body of [
      resumeApproved,
      resumeApprovedEdited,
      resumeRejected,
      resumeChanges,
      resumeExpired,
      inputAnswered,
      inputDismissed,
    ]) {
      expect(resumeRunBodySchema.safeParse(body).success, JSON.stringify(body).slice(0, 80)).toBe(true);
    }
  });

  it('hashes the fixture payload the way the platform does, and the edit differently', () => {
    expect(resumeApproved.payload_hash).toBe(hashPayload(approvalEvent.payload));
    expect(resumeApprovedEdited.payload_hash).not.toBe(resumeApproved.payload_hash);
    expect(resumeApprovedEdited.edited).toBe(true);
  });

  it('never reports an executed action for draft.review', () => {
    for (const body of [resumeApproved, resumeApprovedEdited, resumeRejected, resumeChanges, resumeExpired]) {
      expect(body.result).toEqual({ executed: false });
    }
  });
});

describe('InternalAiEngineGateway.resumeRun against the proposed endpoint', () => {
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

  function stub(response: () => Response | Promise<Response>) {
    const mock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => response());
    vi.stubGlobal('fetch', mock);
    return mock;
  }
  const call = (body: unknown = resumeApproved) => ({
    runId: UPSTREAM_RUN,
    body: body as ResumeRunBody,
    idempotencyKey: 'approval-1:approved',
    contextToken: 'ctx.token',
    requestId: 'req-12345678',
  });

  it('POSTs the fixture body to /api/v2/runs/{run_id}/resume with the internal key, context and idempotency key', async () => {
    const fetchMock = stub(
      () => new Response(JSON.stringify({ status: 'resumed' }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const result = await new InternalAiEngineGateway().resumeRun(call());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${AI_URL}/api/v2/runs/${UPSTREAM_RUN}/resume`);
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-Internal-Api-Key']).toBe(AI_KEY);
    expect(headers['X-Sineva-Context']).toBe('ctx.token');
    expect(headers['Idempotency-Key']).toBe('approval-1:approved');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(resumeApproved);
    expect(result).toEqual({ run_id: UPSTREAM_RUN, status: 'resumed' });
  });

  it('accepts an enveloped answer', async () => {
    stub(() => new Response(JSON.stringify({ success: true, data: { status: 'already_resumed' } }), { status: 200 }));
    const result = await new InternalAiEngineGateway().resumeRun(call());
    expect(result.status).toBe('already_resumed');
  });

  it('is a typed 503 when sineva-ai cannot be reached', async () => {
    stub(() => {
      throw new TypeError('fetch failed');
    });
    await expect(new InternalAiEngineGateway().resumeRun(call())).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('is a typed 502 for a non-2xx answer and for a body off the contract', async () => {
    stub(() => new Response('{"code":"run_unknown"}', { status: 404 }));
    await expect(new InternalAiEngineGateway().resumeRun(call())).rejects.toBeInstanceOf(UpstreamServiceError);

    stub(() => new Response(JSON.stringify({ status: 'maybe' }), { status: 200 }));
    await expect(new InternalAiEngineGateway().resumeRun(call())).rejects.toBeInstanceOf(UpstreamServiceError);
  });
});
