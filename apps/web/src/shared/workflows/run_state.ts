// Run and step states of a Workflow run (ADR-0046). Pure, so the server that
// stores them and the screen that draws them agree on the words.

export const RUN_STATUSES = [
  'queued',
  'running',
  'waiting',
  'needs_review',
  'succeeded',
  'failed',
  'cancelled',
  'budget_exceeded',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const STEP_STATUSES = ['waiting', 'running', 'needs_review', 'done', 'failed', 'skipped'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const RUN_MODES = ['test', 'live'] as const;
export type RunMode = (typeof RUN_MODES)[number];

export const TRIGGER_TYPES = ['manual', 'chat', 'routine', 'mcp'] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

/** The run can still change, so the screen keeps asking and cancel makes sense. */
export function isActiveRunStatus(status: RunStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'waiting' || status === 'needs_review';
}

export function isTerminalRunStatus(status: RunStatus): boolean {
  return !isActiveRunStatus(status);
}

/** Longest step output the platform keeps for the Activity view. */
export const OUTPUT_PREVIEW_MAX = 2000;

export function isRunStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (RUN_STATUSES as readonly string[]).includes(value);
}
export function isStepStatus(value: unknown): value is StepStatus {
  return typeof value === 'string' && (STEP_STATUSES as readonly string[]).includes(value);
}
