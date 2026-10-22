import { installHeaderSessionResolver } from './fakes/header_session_resolver';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getEvents } from '@/app/api/v1/workspaces/[workspace_id]/runs/[run_id]/events/route';
import { POST as postCancel } from '@/app/api/v1/workspaces/[workspace_id]/runs/[run_id]/cancel/route';
import { NotFoundError, UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import { getOpenApiSpec } from '@/server/infrastructure/openapi/spec';

const mockStream = vi.fn();
const mockCancel = vi.fn();

vi.mock('@/server/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/container')>();
  return {
    ...actual,
    getStreamRunUseCase: () => ({ execute: mockStream }),
    getCancelRunUseCase: () => ({ execute: mockCancel }),
  };
});

installHeaderSessionResolver();

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const RUN = 'run_0a1b2c3d-0000-4000-8000-000000000001';

function bodyOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
}

function request(path: string, method: 'GET' | 'POST', headers: Record<string, string> = {}) {
  return new NextRequest(`https://app.sineva.id/api/v1/workspaces/${WS}/runs/${RUN}/${path}`, {
    method,
    headers: {
      'x-test-session-user-id': 'usr-alpha',
      'x-test-session-role': 'member',
      'x-test-session-workspaces': WS,
      ...headers,
    },
  });
}

const params = { params: Promise.resolve({ workspace_id: WS, run_id: RUN }) };

describe('Run routes (WP-M0-30, FR-AIR-12, FR-HUB-20, FR-HUB-21)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET .../runs/{run_id}/events', () => {
    it('streams with the headers the relay needs: event-stream, no cache or transform, no proxy buffering', async () => {
      mockStream.mockResolvedValue(bodyOf('id: 1\nevent: token\ndata: {"token":"Hi"}\n\n'));

      const res = await getEvents(request('events', 'GET'), params);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
      expect(res.headers.get('x-accel-buffering')).toBe('no');
      expect(res.headers.get('content-encoding')).toBe('identity');
      expect(await res.text()).toBe('id: 1\nevent: token\ndata: {"token":"Hi"}\n\n');
    });

    it('is a Node, dynamic route (never edge, never cached)', async () => {
      const mod = await import('@/app/api/v1/workspaces/[workspace_id]/runs/[run_id]/events/route');
      expect(mod.runtime).toBe('nodejs');
      expect(mod.dynamic).toBe('force-dynamic');
    });

    it('passes Last-Event-ID, the run handle and the caller identity from the session to the use case', async () => {
      mockStream.mockResolvedValue(bodyOf(''));
      await getEvents(request('events', 'GET', { 'Last-Event-ID': '7' }), params);

      expect(mockStream).toHaveBeenCalledWith(
        RUN,
        { last_event_id: '7' },
        expect.objectContaining({ user_id: 'usr-alpha', workspace_id: WS }),
      );
    });

    it('returns 401 without a session and never calls the use case', async () => {
      const res = await getEvents(request('events', 'GET', { 'x-test-unauthenticated': 'true' }), params);
      expect(res.status).toBe(401);
      expect(mockStream).not.toHaveBeenCalled();
    });

    it('returns 403 for a viewer (cannot send, so cannot start a run)', async () => {
      const res = await getEvents(request('events', 'GET', { 'x-test-session-role': 'viewer' }), params);
      expect(res.status).toBe(403);
      expect(mockStream).not.toHaveBeenCalled();
    });

    it('returns 404 when the caller is not a member of the workspace', async () => {
      const res = await getEvents(
        request('events', 'GET', { 'x-test-session-workspaces': OTHER_WS }),
        params,
      );
      expect(res.status).toBe(404);
      expect(mockStream).not.toHaveBeenCalled();
    });

    it('returns 404 as a JSON error for a run that is not the caller\'s', async () => {
      mockStream.mockRejectedValue(new NotFoundError('Run', RUN));
      const res = await getEvents(request('events', 'GET'), params);
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toContain('application/json');
    });
  });

  describe('POST .../runs/{run_id}/cancel', () => {
    it('returns 200 with the run status in the envelope', async () => {
      mockCancel.mockResolvedValue({ run_id: RUN, status: 'cancelling' });
      const res = await postCancel(request('cancel', 'POST'), params);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json).toMatchObject({ success: true, data: { run_id: RUN, status: 'cancelling' } });
    });

    it('returns 401, 403 and a cross-workspace 404 before the use case runs', async () => {
      const unauth = await postCancel(request('cancel', 'POST', { 'x-test-unauthenticated': 'true' }), params);
      const viewer = await postCancel(request('cancel', 'POST', { 'x-test-session-role': 'viewer' }), params);
      const foreign = await postCancel(
        request('cancel', 'POST', { 'x-test-session-workspaces': OTHER_WS }),
        params,
      );
      expect([unauth.status, viewer.status, foreign.status]).toEqual([401, 403, 404]);
      expect(mockCancel).not.toHaveBeenCalled();
    });

    it('returns 404 for a foreign run handle', async () => {
      mockCancel.mockRejectedValue(new NotFoundError('Run', RUN));
      expect((await postCancel(request('cancel', 'POST'), params)).status).toBe(404);
    });

    it('returns 503 when sineva-ai cannot be reached', async () => {
      mockCancel.mockRejectedValue(new UpstreamUnavailableError());
      expect((await postCancel(request('cancel', 'POST'), params)).status).toBe(503);
    });
  });

  describe('OpenAPI (R-25)', () => {
    it('documents both run routes with their failure statuses', () => {
      const spec = getOpenApiSpec() as { paths: Record<string, Record<string, { responses: Record<string, unknown> }>> };
      const events = spec.paths['/api/v1/workspaces/{workspace_id}/runs/{run_id}/events']?.get;
      const cancel = spec.paths['/api/v1/workspaces/{workspace_id}/runs/{run_id}/cancel']?.post;
      expect(Object.keys(events?.responses ?? {})).toEqual(expect.arrayContaining(['200', '401', '403', '404']));
      expect(Object.keys(cancel?.responses ?? {})).toEqual(
        expect.arrayContaining(['200', '401', '403', '404', '409', '502', '503']),
      );
    });
  });
});
