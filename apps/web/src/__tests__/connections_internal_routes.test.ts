import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postReconcile } from '@/app/internal/v1/connections/reconcile/route';
import { POST as postApiReconcile } from '@/app/api/internal/v1/connections/reconcile/route';
import { EnqueueConnectionReconcileUseCase } from '@/server/application/connections/refresh/enqueue_connection_reconcile_use_case';
import * as container from '@/server/container';
import * as envModule from '@/server/infrastructure/config/env';
import { InMemoryJobQueue } from './fakes/in_memory_job_queue';

const KEY = 'test-secret-key-primary';

describe('EnqueueConnectionReconcileUseCase (runbook: after a restore)', () => {
  it('queues one reconcile job from the start of the list', async () => {
    const queue = new InMemoryJobQueue();
    const useCase = new EnqueueConnectionReconcileUseCase({ queue, now: () => new Date('2026-10-23T10:00:00Z') });
    const first = await useCase.execute();
    expect(first.job_id).toBeTruthy();
    const job = (await queue.get(first.job_id))!;
    expect(job.job_type).toBe('connection.reconcile');
    expect(job.payload.after_id).toBeNull();
    expect(typeof job.payload.sweep_id).toBe('string');
  });

  it('every call is its own sweep (a second restore later is not swallowed by the first)', async () => {
    const queue = new InMemoryJobQueue();
    const useCase = new EnqueueConnectionReconcileUseCase({ queue });
    const [a, b] = await Promise.all([useCase.execute(), useCase.execute()]);
    expect(a.job_id).not.toBe(b.job_id);
  });
});

describe('POST /internal/v1/connections/reconcile', () => {
  const execute = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockResolvedValue({ job_id: 'job-1' });
    vi.spyOn(container, 'getEnqueueConnectionReconcileUseCase').mockReturnValue({ execute } as never);
    vi.spyOn(envModule, 'getEnvConfig').mockReturnValue({ ai_engine_internal_api_key: KEY } as ReturnType<typeof envModule.getEnvConfig>);
  });

  const request = (path: string, key: string | null = KEY) =>
    new NextRequest(`http://localhost:3000${path}`, { method: 'POST', headers: key ? { 'x-internal-api-key': key } : {} });

  it.each([
    ['/internal/v1/connections/reconcile', postReconcile],
    ['/api/internal/v1/connections/reconcile', postApiReconcile],
  ])('%s: 401 without the internal key, 202 with it', async (path, handler) => {
    expect((await handler(request(path, null))).status).toBe(401);
    expect((await handler(request(path, 'nope'))).status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
    const ok = await handler(request(path));
    expect(ok.status).toBe(202);
    expect((await ok.json()).data).toEqual({ job_id: 'job-1' });
  });
});
