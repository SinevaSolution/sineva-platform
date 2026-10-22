import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';
import { PrismaJobQueue } from '@/server/infrastructure/database/prisma_job_queue';
import { describeJobQueueContract } from '../job_queue_contract';

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function freshQueue(): Promise<PrismaJobQueue> {
  // Jobs have no foreign key to the tables the shared reset hook truncates.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "platform"."jobs"');
  return new PrismaJobQueue(prisma);
}

// Same contract the in-memory fake passes, now against Postgres: the SKIP
// LOCKED claim, the idempotency unique key and the single-flight partial
// unique index all have to give the answers the fake gives.
describeJobQueueContract('postgres', freshQueue);

describe('PrismaJobQueue under concurrent workers (ADR-0038)', () => {
  const T0 = new Date('2026-10-23T10:00:00.000Z');

  it('20 parallel claimers over 10 jobs claim each job exactly once', async () => {
    const queue = await freshQueue();
    for (let i = 0; i < 10; i += 1) {
      await queue.enqueue({ job_type: 'connection.refresh', payload: { i } }, T0);
    }
    const claims = await Promise.all(
      Array.from({ length: 20 }, (_, n) => queue.claim(`w${n}`, ['connection.refresh'], T0, 60_000)),
    );
    const ids = claims.filter((job) => job !== null).map((job) => job!.id);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
  });

  it('single-flight holds under contention: never two running jobs with one concurrency key', async () => {
    const queue = await freshQueue();
    for (let i = 0; i < 6; i += 1) {
      await queue.enqueue({ job_type: 'connection.refresh', concurrency_key: 'conn-1' }, T0);
    }
    const claims = await Promise.all(
      Array.from({ length: 12 }, (_, n) => queue.claim(`w${n}`, ['connection.refresh'], T0, 60_000)),
    );
    expect(claims.filter((job) => job !== null)).toHaveLength(1);
    const running = await prisma.job.count({ where: { status: 'running', concurrency_key: 'conn-1' } });
    expect(running).toBe(1);
  });

  it('the partial unique index itself rejects a second running job with the same key', async () => {
    const queue = await freshQueue();
    const a = await queue.enqueue({ job_type: 'connection.refresh', concurrency_key: 'k' }, T0);
    const b = await queue.enqueue({ job_type: 'connection.refresh', concurrency_key: 'k' }, T0);
    await prisma.job.update({ where: { id: a.job.id }, data: { status: 'running' } });
    await expect(prisma.job.update({ where: { id: b.job.id }, data: { status: 'running' } })).rejects.toThrow();
  });

  it('a job claimed by a dead worker runs once after the lease passes (restart survival)', async () => {
    const queue = await freshQueue();
    const { job } = await queue.enqueue({ job_type: 'connection.refresh' }, T0);
    // Worker 1 claims and "crashes": it never completes.
    await queue.claim('dead', ['connection.refresh'], T0, 1000);
    const later = new Date(T0.getTime() + 5000);
    expect(await queue.reapExpired(later)).toBe(1);
    const reclaimed = await queue.claim('w2', ['connection.refresh'], later, 60_000);
    expect(reclaimed?.id).toBe(job.id);
    expect(await queue.complete(job.id, 'w2', later)).toBe(true);
    // Nothing is left to run twice.
    expect(await queue.claim('w3', ['connection.refresh'], later, 60_000)).toBeNull();
    expect((await queue.get(job.id))?.attempts).toBe(2);
  });

  it('parallel enqueues with one idempotency key create one row', async () => {
    const queue = await freshQueue();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        queue.enqueue({ job_type: 'connection.refresh', idempotency_key: 'connection:c1:123' }, T0),
      ),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await prisma.job.count()).toBe(1);
  });
});
