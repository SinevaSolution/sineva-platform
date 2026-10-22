import type { JobEntity, NewJob } from './job';

export type JobFailure =
  | { kind: 'retry'; run_at: Date; error_code: string }
  | { kind: 'dead'; error_code: string };

export interface JobQueueStats {
  queued: number;
  running: number;
  failed: number;
  /** Age of the oldest queued job whose `run_at` has passed; 0 when none is due. */
  oldest_due_seconds: number;
}

/**
 * Storage for durable jobs. Every method is safe to call from several
 * processes at once; the adapter, not the caller, provides the exclusion.
 */
export interface JobQueue {
  /** Idempotent on `(job_type, idempotency_key)`: a replay returns the first job with `created: false`. */
  enqueue(job: NewJob, now: Date): Promise<{ job: JobEntity; created: boolean }>;
  /**
   * Moves the oldest due queued job of one of `types` to `running` for
   * `workerId`, counts the attempt and sets the lease. Skips a job whose
   * `concurrency_key` is already running. Null when nothing is claimable.
   */
  claim(workerId: string, types: readonly string[], now: Date, leaseMs: number): Promise<JobEntity | null>;
  /** True only when the job is running and held by `workerId`. */
  complete(jobId: string, workerId: string, now: Date): Promise<boolean>;
  fail(jobId: string, workerId: string, failure: JobFailure, now: Date): Promise<boolean>;
  /** Running jobs whose lease ended go back to queued (or failed when out of attempts). Returns how many. */
  reapExpired(now: Date): Promise<number>;
  /** Only a queued job can be cancelled. */
  cancel(jobId: string, now: Date): Promise<boolean>;
  get(jobId: string): Promise<JobEntity | null>;
  stats(now: Date): Promise<JobQueueStats>;
}
