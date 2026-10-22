import { installHeaderSessionResolver } from './fakes/header_session_resolver';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getList } from '@/app/api/v1/workspaces/[workspace_id]/inbox/route';
import { GET as getCounts } from '@/app/api/v1/workspaces/[workspace_id]/inbox/counts/route';
import { GET as getItem } from '@/app/api/v1/workspaces/[workspace_id]/inbox/[item_id]/route';
import { POST as postRead } from '@/app/api/v1/workspaces/[workspace_id]/inbox/[item_id]/read/route';
import { POST as postDismiss } from '@/app/api/v1/workspaces/[workspace_id]/inbox/[item_id]/dismiss/route';
import { POST as postAnswer } from '@/app/api/v1/workspaces/[workspace_id]/inbox/[item_id]/answer/route';
import { POST as postDecision } from '@/app/api/v1/workspaces/[workspace_id]/approvals/[approval_id]/decision/route';
import { POST as postChanges } from '@/app/api/v1/workspaces/[workspace_id]/approvals/[approval_id]/changes/route';
import { AlreadyDecidedError, RunResumeUnavailableError } from '@/server/domain/inbox/inbox_errors';
import { getOpenApiSpec } from '@/server/infrastructure/openapi/spec';

const m = vi.hoisted(() => ({
  list: vi.fn(),
  counts: vi.fn(),
  get: vi.fn(),
  read: vi.fn(),
  dismiss: vi.fn(),
  answer: vi.fn(),
  decide: vi.fn(),
  changes: vi.fn(),
}));

vi.mock('@/server/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/container')>();
  return {
    ...actual,
    getListInboxUseCase: () => ({ execute: m.list }),
    getGetInboxCountsUseCase: () => ({ execute: m.counts }),
    getGetInboxItemUseCase: () => ({ execute: m.get }),
    getMarkInboxItemReadUseCase: () => ({ execute: m.read }),
    getDismissInboxItemUseCase: () => ({ execute: m.dismiss }),
    getAnswerInputRequestUseCase: () => ({ execute: m.answer }),
    getDecideApprovalUseCase: () => ({ execute: m.decide }),
    getRequestApprovalChangesUseCase: () => ({ execute: m.changes }),
  };
});

installHeaderSessionResolver();

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';
const BASE = `https://app.sineva.id/api/v1/workspaces/${WS}`;

type Role = 'owner' | 'admin' | 'member' | 'viewer';

function req(path: string, method: 'GET' | 'POST', over: { role?: Role; ws?: string; unauth?: boolean; body?: unknown; headers?: Record<string, string> } = {}) {
  return new NextRequest(`${BASE}${path}`, {
    method,
    headers: {
      ...(over.unauth ? { 'x-test-unauthenticated': 'true' } : {}),
      'x-test-session-user-id': 'usr-alpha',
      'x-test-session-role': over.role ?? 'member',
      'x-test-session-workspaces': over.ws ?? WS,
      ...(over.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...over.headers,
    },
    ...(over.body !== undefined ? { body: JSON.stringify(over.body) } : {}),
  });
}

const p = { params: Promise.resolve({ workspace_id: WS, item_id: ID, approval_id: ID }) };

const ROUTES = [
  { name: 'GET inbox', call: (o?: object) => getList(req('/inbox', 'GET', o), p), use: m.list, write: false },
  { name: 'GET inbox/counts', call: (o?: object) => getCounts(req('/inbox/counts', 'GET', o), p), use: m.counts, write: false },
  { name: 'GET inbox/{id}', call: (o?: object) => getItem(req(`/inbox/${ID}`, 'GET', o), p), use: m.get, write: false },
  { name: 'POST inbox/{id}/read', call: (o?: object) => postRead(req(`/inbox/${ID}/read`, 'POST', o), p), use: m.read, write: false },
  {
    name: 'POST inbox/{id}/dismiss',
    call: (o?: object) => postDismiss(req(`/inbox/${ID}/dismiss`, 'POST', o), p),
    use: m.dismiss,
    write: true,
  },
  {
    name: 'POST inbox/{id}/answer',
    call: (o?: object) => postAnswer(req(`/inbox/${ID}/answer`, 'POST', { body: { version: 1, answers: { a: 1 } }, ...o }), p),
    use: m.answer,
    write: true,
  },
  {
    name: 'POST approvals/{id}/decision',
    call: (o?: object) =>
      postDecision(req(`/approvals/${ID}/decision`, 'POST', { body: { decision: 'approve', version: 1 }, ...o }), p),
    use: m.decide,
    write: true,
  },
  {
    name: 'POST approvals/{id}/changes',
    call: (o?: object) =>
      postChanges(req(`/approvals/${ID}/changes`, 'POST', { body: { version: 1, instruction: 'Lebih singkat' }, ...o }), p),
    use: m.changes,
    write: true,
  },
] as const;

describe('Inbox routes (WP-M1-40, R-25, FR-INBOX-05, FR-INBOX-11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const route of ROUTES) route.use.mockResolvedValue({ ok: true });
  });

  describe.each(ROUTES)('$name', ({ call, use, write }) => {
    it('401 without a session', async () => {
      const res = await call({ unauth: true });
      expect(res.status).toBe(401);
      expect(use).not.toHaveBeenCalled();
    });

    it('404, never 403, for a workspace the caller is not in', async () => {
      const res = await call({ ws: OTHER_WS });
      expect(res.status).toBe(404);
      expect(use).not.toHaveBeenCalled();
    });

    it('responds in the success envelope with identity taken from the session and the URL', async () => {
      const res = await call({ role: 'admin' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ success: true, data: { ok: true } });
      const ctx = use.mock.calls[0].at(-1);
      expect(ctx).toMatchObject({ user_id: 'usr-alpha', role: 'admin' });
    });

    if (write) {
      it('403 for a viewer, who decides and answers nothing', async () => {
        const res = await call({ role: 'viewer' });
        expect(res.status).toBe(403);
        expect(use).not.toHaveBeenCalled();
      });

      it('refuses a bearer token minted for another audience (MCP) with 403 wrong_token_audience', async () => {
        const mcp = `h.${Buffer.from(JSON.stringify({ aud: 'sineva-mcp', sub: 'u' })).toString('base64url')}.s`;
        const res = await call({ headers: { authorization: `Bearer ${mcp}` } });
        expect(res.status).toBe(403);
        expect(JSON.stringify(await res.json())).toContain('wrong_token_audience');
        expect(use).not.toHaveBeenCalled();

        const prefixed = await call({ headers: { authorization: 'Bearer mcp_abcdef0123456789' } });
        expect(prefixed.status).toBe(403);
        expect(use).not.toHaveBeenCalled();
      });

      it('accepts a Sineva session bearer token (no audience claim)', async () => {
        const session = `h.${Buffer.from(JSON.stringify({ sub: 'u', jti: 's' })).toString('base64url')}.s`;
        const res = await call({ role: 'admin', headers: { authorization: `Bearer ${session}` } });
        expect(res.status).toBe(200);
      });
    }
  });

  it('GET inbox: validates the query, passes it on, and a viewer may open it', async () => {
    m.list.mockResolvedValue({ items: [], next_cursor: null });
    const ok = await getList(req('/inbox?tab=needs_review&agent_slug=sinosocial&limit=5', 'GET', { role: 'viewer' }), p);
    expect(ok.status).toBe(200);
    expect(m.list.mock.calls[0][0]).toEqual({ tab: 'needs_review', agent_slug: 'sinosocial', limit: 5 });

    m.list.mockClear();
    const filtered = await getList(
      req('/inbox?tab=needs_you&kind=approval&source_type=room&q=promo&limit=5', 'GET', { role: 'member' }),
      p,
    );
    expect(filtered.status).toBe(200);
    expect(m.list.mock.calls[0][0]).toEqual({
      tab: 'needs_you',
      kind: 'approval',
      source_type: 'room',
      q: 'promo',
      limit: 5,
    });
    const updatesTab = await getList(req('/inbox?tab=updates', 'GET', { role: 'member' }), p);
    expect(updatesTab.status).toBe(200);
    for (const bad of ['kind=idea', 'source_type=email', `q=${'x'.repeat(81)}`, 'tab=ideas', 'limit=0', 'limit=500', 'agent_slug=Bad Slug']) {
      const res = await getList(req(`/inbox?${bad}`, 'GET'), p);
      expect(res.status, bad).toBe(422);
    }
  });

  it('POST decision: 422 for a bad body or an identity key, and passes the version and edits through', async () => {
    m.decide.mockResolvedValue({ id: ID });
    for (const body of [
      { decision: 'maybe', version: 1 },
      { decision: 'approve' },
      { decision: 'approve', version: 1, user_id: 'usr-x' },
      { decision: 'approve', version: 0 },
    ]) {
      const res = await postDecision(req(`/approvals/${ID}/decision`, 'POST', { body }), p);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    const ok = await postDecision(
      req(`/approvals/${ID}/decision`, 'POST', {
        role: 'admin',
        body: { decision: 'approve', version: 3, edited_payload: { body: 'x' } },
      }),
      p,
    );
    expect(ok.status).toBe(200);
    expect(m.decide).toHaveBeenCalledWith(ID, { decision: 'approve', version: 3, edited_payload: { body: 'x' } }, expect.anything());
  });

  it('POST changes and answer: 422 for a missing instruction or answers', async () => {
    expect((await postChanges(req(`/approvals/${ID}/changes`, 'POST', { body: { version: 1 } }), p)).status).toBe(422);
    expect((await postChanges(req(`/approvals/${ID}/changes`, 'POST', { body: { version: 1, instruction: '  ' } }), p)).status).toBe(422);
    expect((await postAnswer(req(`/inbox/${ID}/answer`, 'POST', { body: { version: 1 } }), p)).status).toBe(422);
  });

  it('maps a lost race to 409 already_decided', async () => {
    m.decide.mockRejectedValue(new AlreadyDecidedError('approve', 'Rina'));
    const res = await postDecision(req(`/approvals/${ID}/decision`, 'POST', { role: 'admin', body: { decision: 'reject', version: 1 } }), p);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.errors).toContainEqual({ code: 'already_decided', field: 'decided_by', detail: 'Rina' });
  });

  it('maps an unreachable sineva-ai to a typed 503 run_resume_unavailable', async () => {
    m.decide.mockRejectedValue(new RunResumeUnavailableError());
    const res = await postDecision(req(`/approvals/${ID}/decision`, 'POST', { role: 'admin', body: { decision: 'approve', version: 1 } }), p);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('dependency_unavailable');
    expect(body.errors[0].code).toBe('run_resume_unavailable');
  });

  it('registers every Inbox route in the OpenAPI document with 502 and 503 on the resuming ones', () => {
    const spec = getOpenApiSpec() as { paths: Record<string, Record<string, { responses: Record<string, unknown> }>> };
    const w = '/api/v1/workspaces/{workspace_id}';
    const expected: Array<[string, string]> = [
      [`${w}/inbox`, 'get'],
      [`${w}/inbox/counts`, 'get'],
      [`${w}/inbox/{item_id}`, 'get'],
      [`${w}/inbox/{item_id}/read`, 'post'],
      [`${w}/inbox/{item_id}/dismiss`, 'post'],
      [`${w}/inbox/{item_id}/answer`, 'post'],
      [`${w}/approvals/{approval_id}/decision`, 'post'],
      [`${w}/approvals/{approval_id}/changes`, 'post'],
      ['/internal/v1/approvals', 'post'],
      ['/internal/v1/input-requests', 'post'],
      ['/internal/v1/inbox/expire', 'post'],
    ];
    for (const [path, method] of expected) {
      expect(spec.paths[path]?.[method], `${method} ${path}`).toBeTruthy();
    }
    for (const path of [`${w}/inbox/{item_id}/dismiss`, `${w}/inbox/{item_id}/answer`, `${w}/approvals/{approval_id}/decision`, `${w}/approvals/{approval_id}/changes`]) {
      const responses = spec.paths[path]!.post!.responses;
      expect(Object.keys(responses), path).toEqual(expect.arrayContaining(['401', '403', '404', '409', '422', '502', '503']));
    }
  });
});
