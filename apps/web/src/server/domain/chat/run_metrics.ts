// Latency of a streamed run (FR-AIR-31). The sample holds no prompt, reply or
// user data on purpose: it is safe to log and to ship to a metrics backend.

export type RunOutcome =
  | 'completed'
  | 'cancelled'
  | 'error'
  | 'needs_approval'
  | 'needs_input'
  | 'budget_exceeded'
  | 'failed';

export interface RunLatencySample {
  agent_slug: string;
  /** `reply_language` from the `done` event; `unknown` when the run never got one. */
  reply_language: string;
  outcome: RunOutcome;
  /** Milliseconds from stream start to the first `token`; null if none arrived. */
  first_token_ms: number | null;
  total_ms: number;
}

export interface RunMetricsRecorder {
  record(sample: RunLatencySample): void;
}
