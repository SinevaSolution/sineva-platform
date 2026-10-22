import { beforeEach, describe, expect, it } from 'vitest';
import { JobRunner } from '@/server/application/jobs/job_runner';
import { TickJobsUseCase, type JobPlanner } from '@/server/application/jobs/tick_jobs_use_case';
import { FatalJobError, RetryableJobError } from '@/server/domain/jobs/job';
import type { JobLog, JobLogEvent } from '@/server/domain/jobs/job_log';
import { InMemoryJobQueue } from './fakes/in_memory_job_queue';

class RecordingLog implements JobLog {
  lines: Array<{ event: JobLogEvent; detail: Record<string, unknown> }> = [];
  record(event: JobLogEvent, detail: Record<string, unknown>): void {
    this.lines.push({ event, detail });
  }
}

const T0 = new Date('2026-10-23T10:00:00.000Z');

describe('JobRunner (ADR-0038)', () => {
  let queue: InMemoryJobQueue;
  let log: RecordingLog;
  let clock: Date;
  let runner: JobRunner;

  beforeEach(() => {
    queue = new InMemoryJobQueue();
    log = new RecordingLog();
    clock = T0;
    runner = new JobRunner({ queue, log, workerId: 'w1', now: () => clock, random: () => 0.5 });
  });

  it('runs a registered handler and marks the job succeeded', async () => {
    const seen: string[] = [];
    runner.register('connection.refresh', async (job) => {
      seen.push(String(job.payload.connection_id));
    });
    const { job } = await queue.enqueue({ job_type: 'connection.refresh', payload: { connection_id: 'c1' } }, T0);

    const result = await runner.runBatch(10);

    expect(seen).toEqual(['c1']);
    expect(result).toEqual({ ran: 1, succeeded: 1, retried: 0, failed: 0 });
    expect((await queue.get(job.id))?.status).toBe('succeeded');
  });

  it('never claims a job type that has no handler', async () => {
    runner.register('connection.refresh', async () => {});
    const { job } = await queue.enqueue({ job_type: 'other.type' }, T0);
    const result = await runner.runBatch(10);
    expect(result.ran).toBe(0);
    expect((await queue.get(job.id))?.status).toBe('queued');
  });

  it('retries only a declared retryable error, with backoff from the policy', async () => {
    runner.register(
      'connection.refresh',
      async () => {
        throw new RetryableJobError('network');
      },
      { base_delay_ms: 1000, max_delay_ms: 60_000, jitter: 0.25 },
    );
    const { job } = await queue.enqueue({ job_type: 'connection.refresh' }, T0);

    const result = await runner.runBatch(10);

    expect(result).toEqual({ ran: 1, succeeded: 0, retried: 1, failed: 0 });
    const after = await queue.get(job.id);
    expect(after?.status).toBe('queued');
    expect(after?.last_error_code).toBe('network');
    // random() = 0.5 gives jitter factor 1, so the first backoff is exactly the base.
    expect(after?.run_at.getTime()).toBe(T0.getTime() + 1000);
  });

  it('does not retry an error that is not declared retryable', async () => {
    runner.register('connection.refresh', async () => {
      throw new Error('invalid_grant: the refresh token abc123 was refused');
    });
    const { job } = await queue.enqueue({ job_type: 'connection.refresh' }, T0);

    const result = await runner.runBatch(10);

    expect(result.failed).toBe(1);
    const after = await queue.get(job.id);
    expect(after?.status).toBe('failed');
    // Code only: an unknown error never stores its message, which can quote a token.
    expect(after?.last_error_code).toBe('unhandled_error');
    expect(JSON.stringify(log.lines)).not.toContain('abc123');
  });

  it('keeps the code of a FatalJobError', async () => {
    runner.register('connection.refresh', async () => {
      throw new FatalJobError('invalid_grant');
    });
    const { job } = await queue.enqueue({ job_type: 'connection.refresh' }, T0);
    await runner.runBatch(10);
    expect((await queue.get(job.id))?.last_error_code).toBe('invalid_grant');
  });

  it('fails a retryable job for good once attempts are used up', async () => {
    runner.register('connection.refresh', async () => {
      throw new RetryableJobError('upstream_5xx');
    });
    const { job } = await queue.enqueue({ job_type: 'connection.refresh', max_attempts: 2 }, T0);

    await runner.runBatch(10);
    clock = new Date(T0.getTime() + 24 * 3600_000);
    const second = await runner.runBatch(10);

    expect(second.failed).toBe(1);
    const after = await queue.get(job.id);
    expect(after?.status).toBe('failed');
    expect(after?.attempts).toBe(2);
    expect(after?.last_error_code).toBe('upstream_5xx');
  });

  it('stops at the batch size', async () => {
    runner.register('connection.refresh', async () => {});
    for (let i = 0; i < 5; i += 1) await queue.enqueue({ job_type: 'connection.refresh' }, T0);
    expect((await runner.runBatch(3)).ran).toBe(3);
    expect((await runner.runBatch(10)).ran).toBe(2);
  });

  it('logs job type, id, attempt and code but never the payload', async () => {
    runner.register('connection.refresh', async () => {
      throw new RetryableJobError('network');
    });
    await queue.enqueue({ job_type: 'connection.refresh', payload: { secret_marker: 'sk-canary-123456789012345678901' } }, T0);
    await runner.runBatch(1);
    const text = JSON.stringify(log.lines);
    expect(text).toContain('job.retry_scheduled');
    expect(text).not.toContain('sk-canary');
  });
});

describe('TickJobsUseCase', () => {
  it('plans, reaps expired leases, then runs ready jobs', async () => {
    const queue = new InMemoryJobQueue();
    const log = new RecordingLog();
    const runner = new JobRunner({ queue, log, workerId: 'w1', now: () => T0 });
    runner.register('connection.refresh', async () => {});
    // A job whose worker died.
    await queue.enqueue({ job_type: 'connection.refresh' }, new Date(T0.getTime() - 3_600_000));
    await queue.claim('dead-worker', ['connection.refresh'], new Date(T0.getTime() - 3_600_000), 1000);

    const planner: JobPlanner = {
      name: 'refresh',
      async plan(now) {
        const { created } = await queue.enqueue({ job_type: 'connection.refresh', idempotency_key: 'c1:1' }, now);
        return created ? 1 : 0;
      },
    };
    const tick = new TickJobsUseCase({ queue, runner, planners: [planner], log, now: () => T0 });

    const first = await tick.execute({ max_jobs: 25 });
    expect(first.planned).toBe(1);
    expect(first.reaped).toBe(1);
    expect(first.ran).toBe(2);
    expect(first.succeeded).toBe(2);

    // A second tick plans nothing new: the idempotency key makes the replay a no-op.
    const second = await tick.execute({ max_jobs: 25 });
    expect(second.planned).toBe(0);
    expect(second.ran).toBe(0);
  });

  it('a failing planner is reported and does not stop the drain', async () => {
    const queue = new InMemoryJobQueue();
    const log = new RecordingLog();
    const runner = new JobRunner({ queue, log, workerId: 'w1', now: () => T0 });
    runner.register('connection.refresh', async () => {});
    await queue.enqueue({ job_type: 'connection.refresh' }, T0);
    const broken: JobPlanner = {
      name: 'broken',
      async plan() {
        throw new Error('db down');
      },
    };
    const tick = new TickJobsUseCase({ queue, runner, planners: [broken], log, now: () => T0 });
    const result = await tick.execute({ max_jobs: 5 });
    expect(result.ran).toBe(1);
    expect(result.planner_errors).toBe(1);
  });
});
