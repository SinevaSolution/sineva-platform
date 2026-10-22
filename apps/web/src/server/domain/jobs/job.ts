// Durable background jobs (ADR-0038). Plain data and rules only; storage is a
// port (`job_queue.ts`) and the Postgres adapter lives in infrastructure.

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface JobEntity {
  id: string;
  job_type: string;
  /** Ids and small parameters only. Never a secret, a token or message text. */
  payload: Record<string, unknown>;
  status: JobStatus;
  run_at: Date;
  attempts: number;
  max_attempts: number;
  idempotency_key: string | null;
  /** At most one job with this key is running at any moment (single-flight). */
  concurrency_key: string | null;
  workspace_id: string | null;
  locked_by: string | null;
  lease_expires_at: Date | null;
  last_error_code: string | null;
  created_at: Date;
  updated_at: Date;
  finished_at: Date | null;
}

export interface NewJob {
  job_type: string;
  payload?: Record<string, unknown>;
  run_at?: Date;
  max_attempts?: number;
  /** Enqueuing the same `(job_type, idempotency_key)` twice yields the first job. */
  idempotency_key?: string;
  concurrency_key?: string;
  workspace_id?: string;
}

export const DEFAULT_MAX_ATTEMPTS = 5;

export interface RetryPolicy {
  base_delay_ms: number;
  max_delay_ms: number;
  /** 0.25 means the delay varies by plus or minus 25 percent. */
  jitter: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  base_delay_ms: 5_000,
  max_delay_ms: 15 * 60_000,
  jitter: 0.25,
};

/**
 * A handler throws this for failures that a later attempt can fix (network
 * errors, 5xx, lock contention). Anything else fails the job at once: a
 * refused refresh token, for example, never becomes valid by waiting.
 */
export class RetryableJobError extends Error {
  constructor(
    readonly code: string,
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = 'RetryableJobError';
  }
}

/** A handler throws this to fail without retry and with a stable code. */
export class FatalJobError extends Error {
  constructor(
    readonly code: string,
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = 'FatalJobError';
  }
}

/**
 * Delay before the next attempt, where `attempt` counts attempts already made
 * (1 after the first failure). Exponential, capped, then jittered; the cap
 * applies before jitter so the spread never exceeds `max * (1 + jitter)`.
 * `random` is injected (0 inclusive, 1 exclusive) so tests can pin the bounds.
 */
export function computeBackoffMs(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(0, attempt - 1);
  const capped = Math.min(policy.max_delay_ms, policy.base_delay_ms * 2 ** exponent);
  const spread = 1 + policy.jitter * (2 * random() - 1);
  return Math.round(capped * spread);
}
