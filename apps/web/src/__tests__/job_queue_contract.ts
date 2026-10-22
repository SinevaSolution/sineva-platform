import { describe, expect, it } from 'vitest';
import type { JobQueue } from '@/server/domain/jobs/job_queue';

// One behavioural contract that the in-memory fake and the Postgres adapter
// both have to satisfy, so a unit test against the fake proves the same rules
// the integration suite proves against the database.
export function describeJobQueueContract(
  name: string,
  makeQueue: () => Promise<JobQueue> | JobQueue,
): void {
  const T0 = new Date('2026-10-23T10:00:00.000Z');
  const at = (ms: number) => new Date(T0.getTime() + ms);
  const TYPES = ['connection.refresh', 'connection.health'] as const;

  describe(`JobQueue contract: ${name}`, () => {
    it('enqueue is idempotent on (job_type, idempotency_key)', async () => {
      const queue = await makeQueue();
      const first = await queue.enqueue({ job_type: 'connection.refresh', idempotency_key: 'k1' }, T0);
      const again = await queue.enqueue({ job_type: 'connection.refresh', idempotency_key: 'k1' }, at(1000));
      expect(first.created).toBe(true);
      expect(again.created).toBe(false);
      expect(again.job.id).toBe(first.job.id);
      // The same key under another type is a different job.
      const other = await queue.enqueue({ job_type: 'connection.health', idempotency_key: 'k1' }, T0);
      expect(other.created).toBe(true);
      expect(other.job.id).not.toBe(first.job.id);
    });

    it('claims the oldest due job, counts the attempt and sets a lease', async () => {
      const queue = await makeQueue();
      await queue.enqueue({ job_type: 'connection.refresh', run_at: at(5000), payload: { n: 2 } }, T0);
      const due = await queue.enqueue({ job_type: 'connection.refresh', run_at: at(0), payload: { n: 1 } }, T0);
      const claimed = await queue.claim('w1', TYPES, at(1000), 60_000);
      expect(claimed?.id).toBe(due.job.id);
      expect(claimed?.status).toBe('running');
      expect(claimed?.attempts).toBe(1);
      expect(claimed?.locked_by).toBe('w1');
      expect(claimed?.lease_expires_at?.getTime()).toBe(at(1000 + 60_000).getTime());
      // The second job is not due yet.
      expect(await queue.claim('w1', TYPES, at(1000), 60_000)).toBeNull();
    });

    it('does not claim a job of a type the worker has no handler for', async () => {
      const queue = await makeQueue();
      await queue.enqueue({ job_type: 'something.else' }, T0);
      expect(await queue.claim('w1', TYPES, at(1), 60_000)).toBeNull();
    });

    it('two workers never claim the same job', async () => {
      const queue = await makeQueue();
      await queue.enqueue({ job_type: 'connection.refresh' }, T0);
      await queue.enqueue({ job_type: 'connection.refresh' }, T0);
      const [a, b, c] = await Promise.all([
        queue.claim('w1', TYPES, at(1), 60_000),
        queue.claim('w2', TYPES, at(1), 60_000),
        queue.claim('w3', TYPES, at(1), 60_000),
      ]);
      const ids = [a, b, c].filter((job) => job !== null).map((job) => job!.id);
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
    });

    it('single-flight: a concurrency key allows one running job at a time', async () => {
      const queue = await makeQueue();
      const first = await queue.enqueue({ job_type: 'connection.refresh', concurrency_key: 'conn-1' }, T0);
      await queue.enqueue({ job_type: 'connection.refresh', concurrency_key: 'conn-1', run_at: at(1) }, T0);
      const other = await queue.enqueue({ job_type: 'connection.refresh', concurrency_key: 'conn-2', run_at: at(2) }, T0);

      const claims = await Promise.all([
        queue.claim('w1', TYPES, at(10), 60_000),
        queue.claim('w2', TYPES, at(10), 60_000),
        queue.claim('w3', TYPES, at(10), 60_000),
      ]);
      const got = claims.filter((job) => job !== null).map((job) => job!);
      // conn-1 once, conn-2 once; the sibling of conn-1 waits.
      expect(got).toHaveLength(2);
      expect(got.map((job) => job.concurrency_key).sort()).toEqual(['conn-1', 'conn-2']);
      expect(got.map((job) => job.id)).toContain(first.job.id);
      expect(got.map((job) => job.id)).toContain(other.job.id);

      // Once the running one completes, its sibling becomes claimable.
      const running = got.find((job) => job.concurrency_key === 'conn-1')!;
      expect(await queue.complete(running.id, running.locked_by!, at(20))).toBe(true);
      const next = await queue.claim('w4', TYPES, at(30), 60_000);
      expect(next?.concurrency_key).toBe('conn-1');
      expect(next?.id).not.toBe(first.job.id);
    });

    it('complete and fail only work for the worker that holds the job', async () => {
      const queue = await makeQueue();
      await queue.enqueue({ job_type: 'connection.refresh' }, T0);
      const job = (await queue.claim('w1', TYPES, at(1), 60_000))!;
      expect(await queue.complete(job.id, 'someone-else', at(2))).toBe(false);
      expect(await queue.fail(job.id, 'someone-else', { kind: 'dead', error_code: 'x' }, at(2))).toBe(false);
      expect(await queue.complete(job.id, 'w1', at(2))).toBe(true);
      const done = await queue.get(job.id);
      expect(done?.status).toBe('succeeded');
      expect(done?.finished_at).not.toBeNull();
      expect(done?.locked_by).toBeNull();
      // A finished job cannot be completed again.
      expect(await queue.complete(job.id, 'w1', at(3))).toBe(false);
    });

    it('fail with retry requeues at run_at and keeps the error code; dead is final', async () => {
      const queue = await makeQueue();
      await queue.enqueue({ job_type: 'connection.refresh' }, T0);
      const job = (await queue.claim('w1', TYPES, at(1), 60_000))!;
      expect(await queue.fail(job.id, 'w1', { kind: 'retry', run_at: at(10_000), error_code: 'network' }, at(2))).toBe(true);
      const retried = await queue.get(job.id);
      expect(retried?.status).toBe('queued');
      expect(retried?.run_at.getTime()).toBe(at(10_000).getTime());
      expect(retried?.last_error_code).toBe('network');
      expect(retried?.locked_by).toBeNull();
      expect(await queue.claim('w1', TYPES, at(5000), 60_000)).toBeNull();
      const second = (await queue.claim('w1', TYPES, at(10_000), 60_000))!;
      expect(second.attempts).toBe(2);
      expect(await queue.fail(second.id, 'w1', { kind: 'dead', error_code: 'invalid_grant' }, at(10_001))).toBe(true);
      const dead = await queue.get(second.id);
      expect(dead?.status).toBe('failed');
      expect(dead?.last_error_code).toBe('invalid_grant');
      expect(await queue.claim('w1', TYPES, at(99_999_999), 60_000)).toBeNull();
    });

    it('a job whose worker died is returned by reapExpired once, and fails when out of attempts', async () => {
      const queue = await makeQueue();
      await queue.enqueue({ job_type: 'connection.refresh', max_attempts: 2 }, T0);
      const first = (await queue.claim('w1', TYPES, at(0), 1000))!;
      expect(await queue.reapExpired(at(500))).toBe(0);
      expect(await queue.reapExpired(at(1500))).toBe(1);
      expect((await queue.get(first.id))?.status).toBe('queued');
      // The dead worker cannot complete it any more.
      expect(await queue.complete(first.id, 'w1', at(1600))).toBe(false);
      const second = (await queue.claim('w2', TYPES, at(2000), 1000))!;
      expect(second.attempts).toBe(2);
      expect(await queue.reapExpired(at(4000))).toBe(1);
      const final = await queue.get(first.id);
      expect(final?.status).toBe('failed');
      expect(final?.last_error_code).toBe('lease_expired');
    });

    it('cancel only affects a queued job', async () => {
      const queue = await makeQueue();
      const queued = await queue.enqueue({ job_type: 'connection.refresh' }, T0);
      expect(await queue.cancel(queued.job.id, at(1))).toBe(true);
      expect((await queue.get(queued.job.id))?.status).toBe('cancelled');
      await queue.enqueue({ job_type: 'connection.refresh' }, T0);
      const running = (await queue.claim('w1', TYPES, at(1), 1000))!;
      expect(await queue.cancel(running.id, at(2))).toBe(false);
    });

    it('stats report depth and the age of the oldest due job', async () => {
      const queue = await makeQueue();
      await queue.enqueue({ job_type: 'connection.refresh', run_at: at(0) }, T0);
      await queue.enqueue({ job_type: 'connection.refresh', run_at: at(60_000) }, T0);
      await queue.enqueue({ job_type: 'connection.health', run_at: at(10 * 60_000) }, T0);
      const running = (await queue.claim('w1', TYPES, at(1000), 60_000))!;
      expect(running).not.toBeNull();
      const stats = await queue.stats(at(120_000));
      expect(stats.running).toBe(1);
      expect(stats.queued).toBe(2);
      expect(stats.failed).toBe(0);
      // The second job is due (run_at at 60 s), 60 s overdue at 120 s.
      expect(stats.oldest_due_seconds).toBe(60);
    });
  });
}
