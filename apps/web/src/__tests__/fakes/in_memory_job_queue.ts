import { randomUUID } from 'node:crypto';
import { DEFAULT_MAX_ATTEMPTS, type JobEntity, type NewJob } from '@/server/domain/jobs/job';
import type { JobFailure, JobQueue, JobQueueStats } from '@/server/domain/jobs/job_queue';

/**
 * Unit-test stand-in obeying the same contract as the Postgres adapter
 * (`job_queue_contract.ts`). Single process, so every method is atomic by
 * construction; the point is the rules, not the locking.
 */
export class InMemoryJobQueue implements JobQueue {
  private readonly jobs = new Map<string, JobEntity>();

  async enqueue(input: NewJob, now: Date): Promise<{ job: JobEntity; created: boolean }> {
    if (input.idempotency_key) {
      for (const existing of this.jobs.values()) {
        if (existing.job_type === input.job_type && existing.idempotency_key === input.idempotency_key) {
          return { job: { ...existing }, created: false };
        }
      }
    }
    const job: JobEntity = {
      id: randomUUID(),
      job_type: input.job_type,
      payload: input.payload ?? {},
      status: 'queued',
      run_at: input.run_at ?? now,
      attempts: 0,
      max_attempts: input.max_attempts ?? DEFAULT_MAX_ATTEMPTS,
      idempotency_key: input.idempotency_key ?? null,
      concurrency_key: input.concurrency_key ?? null,
      workspace_id: input.workspace_id ?? null,
      locked_by: null,
      lease_expires_at: null,
      last_error_code: null,
      created_at: now,
      updated_at: now,
      finished_at: null,
    };
    this.jobs.set(job.id, job);
    return { job: { ...job }, created: true };
  }

  async claim(workerId: string, types: readonly string[], now: Date, leaseMs: number): Promise<JobEntity | null> {
    const runningKeys = new Set(
      [...this.jobs.values()]
        .filter((job) => job.status === 'running' && job.concurrency_key)
        .map((job) => job.concurrency_key),
    );
    const candidate = [...this.jobs.values()]
      .filter(
        (job) =>
          job.status === 'queued' &&
          job.run_at.getTime() <= now.getTime() &&
          types.includes(job.job_type) &&
          !(job.concurrency_key && runningKeys.has(job.concurrency_key)),
      )
      .sort((a, b) => a.run_at.getTime() - b.run_at.getTime() || a.created_at.getTime() - b.created_at.getTime())[0];
    if (!candidate) return null;
    candidate.status = 'running';
    candidate.attempts += 1;
    candidate.locked_by = workerId;
    candidate.lease_expires_at = new Date(now.getTime() + leaseMs);
    candidate.updated_at = now;
    return { ...candidate };
  }

  private held(jobId: string, workerId: string): JobEntity | null {
    const job = this.jobs.get(jobId);
    return job && job.status === 'running' && job.locked_by === workerId ? job : null;
  }

  async complete(jobId: string, workerId: string, now: Date): Promise<boolean> {
    const job = this.held(jobId, workerId);
    if (!job) return false;
    job.status = 'succeeded';
    job.locked_by = null;
    job.lease_expires_at = null;
    job.finished_at = now;
    job.updated_at = now;
    return true;
  }

  async fail(jobId: string, workerId: string, failure: JobFailure, now: Date): Promise<boolean> {
    const job = this.held(jobId, workerId);
    if (!job) return false;
    job.locked_by = null;
    job.lease_expires_at = null;
    job.last_error_code = failure.error_code;
    job.updated_at = now;
    if (failure.kind === 'retry') {
      job.status = 'queued';
      job.run_at = failure.run_at;
    } else {
      job.status = 'failed';
      job.finished_at = now;
    }
    return true;
  }

  async reapExpired(now: Date): Promise<number> {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status !== 'running' || !job.lease_expires_at || job.lease_expires_at.getTime() > now.getTime()) {
        continue;
      }
      count += 1;
      job.locked_by = null;
      job.lease_expires_at = null;
      job.updated_at = now;
      if (job.attempts >= job.max_attempts) {
        job.status = 'failed';
        job.last_error_code = 'lease_expired';
        job.finished_at = now;
      } else {
        job.status = 'queued';
        job.run_at = now;
      }
    }
    return count;
  }

  async cancel(jobId: string, now: Date): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'queued') return false;
    job.status = 'cancelled';
    job.finished_at = now;
    job.updated_at = now;
    return true;
  }

  async get(jobId: string): Promise<JobEntity | null> {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  async stats(now: Date): Promise<JobQueueStats> {
    const all = [...this.jobs.values()];
    const due = all
      .filter((job) => job.status === 'queued' && job.run_at.getTime() <= now.getTime())
      .map((job) => job.run_at.getTime());
    return {
      queued: all.filter((job) => job.status === 'queued').length,
      running: all.filter((job) => job.status === 'running').length,
      failed: all.filter((job) => job.status === 'failed').length,
      oldest_due_seconds: due.length === 0 ? 0 : Math.floor((now.getTime() - Math.min(...due)) / 1000),
    };
  }
}
