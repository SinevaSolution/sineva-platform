import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postTick } from '@/app/internal/v1/jobs/tick/route';
import { POST as postApiTick } from '@/app/api/internal/v1/jobs/tick/route';
import { GET as getStats } from '@/app/internal/v1/jobs/stats/route';
import { GET as getApiStats } from '@/app/api/internal/v1/jobs/stats/route';
import * as container from '@/server/container';
import * as envModule from '@/server/infrastructure/config/env';

const KEY = 'test-secret-key-primary';

function request(path: string, method: 'POST' | 'GET', body?: unknown, key: string | null = KEY) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(key ? { 'x-internal-api-key': key } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('internal job routes (ADR-0038)', () => {
  const tick = vi.fn();
  const stats = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(container, 'getTickJobsUseCase').mockReturnValue({ execute: tick } as never);
    vi.spyOn(container, 'getJobQueue').mockReturnValue({ stats } as never);
    vi.spyOn(envModule, 'getEnvConfig').mockReturnValue({
      ai_engine_internal_api_key: KEY,
    } as ReturnType<typeof envModule.getEnvConfig>);
  });

  describe.each([
    ['/internal/v1/jobs/tick', postTick],
    ['/api/internal/v1/jobs/tick', postApiTick],
  ])('POST %s', (path, handler) => {
    it('rejects a missing or wrong internal key with 401 and runs nothing', async () => {
      expect((await handler(request(path, 'POST', {}, null))).status).toBe(401);
      expect((await handler(request(path, 'POST', {}, 'nope'))).status).toBe(401);
      expect(tick).not.toHaveBeenCalled();
    });

    it('runs one beat with the default batch size when the body is empty', async () => {
      tick.mockResolvedValueOnce({ planned: 1, reaped: 0, ran: 2, succeeded: 2, retried: 0, failed: 0, planner_errors: 0 });
      const response = await handler(request(path, 'POST'));
      expect(response.status).toBe(200);
      expect(tick).toHaveBeenCalledWith({ max_jobs: 25 });
      const body = await response.json();
      expect(body.data).toEqual({ planned: 1, reaped: 0, ran: 2, succeeded: 2, retried: 0, failed: 0, planner_errors: 0 });
    });

    it('passes max_jobs through and refuses values outside 1 to 100', async () => {
      tick.mockResolvedValue({ planned: 0, reaped: 0, ran: 0, succeeded: 0, retried: 0, failed: 0, planner_errors: 0 });
      expect((await handler(request(path, 'POST', { max_jobs: 100 }))).status).toBe(200);
      expect(tick).toHaveBeenLastCalledWith({ max_jobs: 100 });
      expect((await handler(request(path, 'POST', { max_jobs: 0 }))).status).toBe(422);
      expect((await handler(request(path, 'POST', { max_jobs: 101 }))).status).toBe(422);
      // The schema is strict: a workspace or user key is refused, not ignored.
      expect((await handler(request(path, 'POST', { workspace_id: 'x' }))).status).toBe(422);
    });
  });

  describe.each([
    ['/internal/v1/jobs/stats', getStats],
    ['/api/internal/v1/jobs/stats', getApiStats],
  ])('GET %s', (path, handler) => {
    it('rejects without the internal key', async () => {
      expect((await handler(request(path, 'GET', undefined, null))).status).toBe(401);
      expect(stats).not.toHaveBeenCalled();
    });

    it('reports queue depth from the queue itself', async () => {
      stats.mockResolvedValueOnce({ queued: 3, running: 1, failed: 0, oldest_due_seconds: 42 });
      const response = await handler(request(path, 'GET'));
      expect(response.status).toBe(200);
      expect((await response.json()).data).toEqual({ queued: 3, running: 1, failed: 0, oldest_due_seconds: 42 });
    });
  });
});
