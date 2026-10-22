import {
  DEFAULT_RETRY_POLICY,
  FatalJobError,
  RetryableJobError,
  computeBackoffMs,
  type JobEntity,
  type RetryPolicy,
} from '@/server/domain/jobs/job';
import type { JobLog } from '@/server/domain/jobs/job_log';
import type { JobQueue } from '@/server/domain/jobs/job_queue';

export type JobHandler = (job: JobEntity, context: { now: Date }) => Promise<void>;

export interface BatchResult {
  ran: number;
  succeeded: number;
  retried: number;
  failed: number;
}

export interface JobRunnerDeps {
  queue: JobQueue;
  log: JobLog;
  workerId: string;
  now?: () => Date;
  random?: () => number;
  /** How long a claim is held before another tick may take the job back. */
  leaseMs?: number;
}

const DEFAULT_LEASE_MS = 5 * 60_000;

interface Registration {
  handler: JobHandler;
  retry: RetryPolicy;
}

/**
 * Runs due jobs one after another in the calling process. There is no
 * background loop here on purpose: the platform has no scheduler, so a tick
 * (ADR-0038) calls `runBatch`, and a later worker process can call it in a
 * loop without changing this class.
 */
export class JobRunner {
  private readonly handlers = new Map<string, Registration>();
  private readonly now: () => Date;

  constructor(private readonly deps: JobRunnerDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  register(type: string, handler: JobHandler, retry: RetryPolicy = DEFAULT_RETRY_POLICY): void {
    this.handlers.set(type, { handler, retry });
  }

  types(): string[] {
    return [...this.handlers.keys()];
  }

  async runBatch(max: number): Promise<BatchResult> {
    const result: BatchResult = { ran: 0, succeeded: 0, retried: 0, failed: 0 };
    const types = this.types();
    if (types.length === 0) return result;

    while (result.ran < max) {
      const job = await this.deps.queue.claim(
        this.deps.workerId,
        types,
        this.now(),
        this.deps.leaseMs ?? DEFAULT_LEASE_MS,
      );
      if (!job) break;
      result.ran += 1;
      const outcome = await this.execute(job);
      result[outcome] += 1;
    }
    return result;
  }

  private async execute(job: JobEntity): Promise<'succeeded' | 'retried' | 'failed'> {
    const registration = this.handlers.get(job.job_type)!;
    this.deps.log.record('job.started', { job_type: job.job_type, job_id: job.id, attempt: job.attempts });
    try {
      await registration.handler(job, { now: this.now() });
    } catch (error) {
      return this.handleFailure(job, registration.retry, error);
    }
    await this.deps.queue.complete(job.id, this.deps.workerId, this.now());
    this.deps.log.record('job.succeeded', { job_type: job.job_type, job_id: job.id, attempt: job.attempts });
    return 'succeeded';
  }

  private async handleFailure(
    job: JobEntity,
    policy: RetryPolicy,
    error: unknown,
  ): Promise<'retried' | 'failed'> {
    const now = this.now();
    // Only the code travels: the message of an unknown error can quote a token
    // or a response body, and the job row and the log both keep this value.
    if (error instanceof RetryableJobError && job.attempts < job.max_attempts) {
      const delay = computeBackoffMs(job.attempts, policy, this.deps.random);
      await this.deps.queue.fail(
        job.id,
        this.deps.workerId,
        { kind: 'retry', run_at: new Date(now.getTime() + delay), error_code: error.code },
        now,
      );
      this.deps.log.record('job.retry_scheduled', {
        job_type: job.job_type,
        job_id: job.id,
        attempt: job.attempts,
        code: error.code,
      });
      return 'retried';
    }
    const code =
      error instanceof RetryableJobError || error instanceof FatalJobError ? error.code : 'unhandled_error';
    await this.deps.queue.fail(job.id, this.deps.workerId, { kind: 'dead', error_code: code }, now);
    this.deps.log.record('job.failed', {
      job_type: job.job_type,
      job_id: job.id,
      attempt: job.attempts,
      code,
    });
    return 'failed';
  }
}
