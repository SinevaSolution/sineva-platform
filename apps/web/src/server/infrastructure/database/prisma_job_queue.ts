import 'server-only';
import { DEFAULT_MAX_ATTEMPTS, type JobEntity, type JobStatus, type NewJob } from '@/server/domain/jobs/job';
import type { JobFailure, JobQueue, JobQueueStats } from '@/server/domain/jobs/job_queue';
import { Prisma, type PrismaClient } from './generated/client';

interface JobRow {
  id: string;
  job_type: string;
  payload: unknown;
  status: string;
  run_at: Date;
  attempts: number;
  max_attempts: number;
  idempotency_key: string | null;
  concurrency_key: string | null;
  workspace_id: string | null;
  locked_by: string | null;
  lease_expires_at: Date | null;
  last_error_code: string | null;
  created_at: Date;
  updated_at: Date;
  finished_at: Date | null;
}

function mapJob(row: JobRow): JobEntity {
  return {
    ...row,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    status: row.status as JobStatus,
  };
}

// How many times a claim retries when it loses the single-flight race (the
// unique index rejected the UPDATE). Each retry re-evaluates the NOT EXISTS
// guard against a now-committed sibling, so one retry normally suffices.
const CLAIM_RACE_RETRIES = 5;

function isUniqueViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2002' || JSON.stringify(error.meta ?? {}).includes('23505');
  }
  return error instanceof Error && error.message.includes('23505');
}

/**
 * Postgres job queue (ADR-0038). `claim` is one statement: a `FOR UPDATE SKIP
 * LOCKED` subselect picks the oldest due job nobody else holds and the outer
 * UPDATE moves it to running, so two workers never get the same row and a
 * crashed worker leaves nothing half done. The single-flight guarantee is the
 * partial unique index `jobs_one_running_per_key_idx`; the NOT EXISTS guard
 * only keeps the common case from touching it.
 */
export class PrismaJobQueue implements JobQueue {
  constructor(private readonly prisma: PrismaClient) {}

  async enqueue(input: NewJob, now: Date): Promise<{ job: JobEntity; created: boolean }> {
    const data = {
      job_type: input.job_type,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      run_at: input.run_at ?? now,
      max_attempts: input.max_attempts ?? DEFAULT_MAX_ATTEMPTS,
      idempotency_key: input.idempotency_key ?? null,
      concurrency_key: input.concurrency_key ?? null,
      workspace_id: input.workspace_id ?? null,
      created_at: now,
      updated_at: now,
    };
    if (!input.idempotency_key) {
      return { job: mapJob(await this.prisma.job.create({ data })), created: true };
    }
    // `skipDuplicates` style insert: the unique key decides, not a read-then-write.
    const inserted = await this.prisma.job.createMany({ data: [data], skipDuplicates: true });
    const row = await this.prisma.job.findUniqueOrThrow({
      where: { job_type_idempotency_key: { job_type: input.job_type, idempotency_key: input.idempotency_key } },
    });
    return { job: mapJob(row), created: inserted.count === 1 };
  }

  async claim(workerId: string, types: readonly string[], now: Date, leaseMs: number): Promise<JobEntity | null> {
    if (types.length === 0) return null;
    const leaseUntil = new Date(now.getTime() + leaseMs);
    for (let attempt = 0; attempt <= CLAIM_RACE_RETRIES; attempt += 1) {
      try {
        const rows = await this.prisma.$queryRaw<JobRow[]>`
          UPDATE "platform"."jobs"
          SET "status" = 'running',
              "locked_by" = ${workerId},
              "lease_expires_at" = ${leaseUntil},
              "attempts" = "attempts" + 1,
              "updated_at" = ${now}
          WHERE "id" = (
            SELECT j."id" FROM "platform"."jobs" j
            WHERE j."status" = 'queued'
              AND j."run_at" <= ${now}
              AND j."job_type" = ANY(${types as string[]})
              AND (
                j."concurrency_key" IS NULL
                OR NOT EXISTS (
                  SELECT 1 FROM "platform"."jobs" r
                  WHERE r."status" = 'running' AND r."concurrency_key" = j."concurrency_key"
                )
              )
            ORDER BY j."run_at", j."created_at"
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          RETURNING *`;
        return rows[0] ? mapJob(rows[0]) : null;
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === CLAIM_RACE_RETRIES) throw error;
      }
    }
    return null;
  }

  async complete(jobId: string, workerId: string, now: Date): Promise<boolean> {
    const result = await this.prisma.job.updateMany({
      where: { id: jobId, status: 'running', locked_by: workerId },
      data: { status: 'succeeded', locked_by: null, lease_expires_at: null, finished_at: now, updated_at: now },
    });
    return result.count === 1;
  }

  async fail(jobId: string, workerId: string, failure: JobFailure, now: Date): Promise<boolean> {
    const base = { locked_by: null, lease_expires_at: null, last_error_code: failure.error_code, updated_at: now };
    const result = await this.prisma.job.updateMany({
      where: { id: jobId, status: 'running', locked_by: workerId },
      data:
        failure.kind === 'retry'
          ? { ...base, status: 'queued', run_at: failure.run_at }
          : { ...base, status: 'failed', finished_at: now },
    });
    return result.count === 1;
  }

  async reapExpired(now: Date): Promise<number> {
    // One statement, so the "out of attempts" decision and the update cannot
    // disagree under concurrent ticks.
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "platform"."jobs"
      SET "status" = CASE WHEN "attempts" >= "max_attempts" THEN 'failed' ELSE 'queued' END,
          "last_error_code" = CASE WHEN "attempts" >= "max_attempts" THEN 'lease_expired' ELSE "last_error_code" END,
          "finished_at" = CASE WHEN "attempts" >= "max_attempts" THEN ${now}::timestamptz ELSE NULL END,
          "run_at" = CASE WHEN "attempts" >= "max_attempts" THEN "run_at" ELSE ${now}::timestamptz END,
          "locked_by" = NULL,
          "lease_expires_at" = NULL,
          "updated_at" = ${now}
      WHERE "status" = 'running' AND "lease_expires_at" IS NOT NULL AND "lease_expires_at" <= ${now}
      RETURNING "id"`;
    return rows.length;
  }

  async cancel(jobId: string, now: Date): Promise<boolean> {
    const result = await this.prisma.job.updateMany({
      where: { id: jobId, status: 'queued' },
      data: { status: 'cancelled', finished_at: now, updated_at: now },
    });
    return result.count === 1;
  }

  async get(jobId: string): Promise<JobEntity | null> {
    const row = await this.prisma.job.findUnique({ where: { id: jobId } });
    return row ? mapJob(row) : null;
  }

  async stats(now: Date): Promise<JobQueueStats> {
    const [counts, oldest] = await Promise.all([
      this.prisma.job.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.job.findFirst({
        where: { status: 'queued', run_at: { lte: now } },
        orderBy: { run_at: 'asc' },
        select: { run_at: true },
      }),
    ]);
    const count = (status: string) => counts.find((row) => row.status === status)?._count._all ?? 0;
    return {
      queued: count('queued'),
      running: count('running'),
      failed: count('failed'),
      oldest_due_seconds: oldest ? Math.floor((now.getTime() - oldest.run_at.getTime()) / 1000) : 0,
    };
  }
}
