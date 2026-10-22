import type { RequestContext } from '@/server/domain/context/request_context';
import type { RunBudget } from '@/server/domain/context/signed_context';
import type { WorkflowDefinition } from '@/shared/workflows/definition';
import type { RunMode, RunStatus, StepStatus, TriggerType } from '@/shared/workflows/run_state';
import type { ActionMeta } from '@/shared/workflows/validate';

// Ports the Workflow use cases need next to the repositories (ADR-0045, ADR-0046).

// --- the run engine in sineva-ai ------------------------------------------

/** Signed context minted for the acting user (ADR-0021). */
export interface WorkflowRunCall {
  context_token: string;
  request_id?: string;
}

export interface StartRunRequest {
  /** The correlation id the platform chose (`engine_run_id`). */
  run_id: string;
  kind: 'workflow';
  mode: RunMode;
  workflow_id: string;
  /** Null for a test run of a draft. */
  version_number: number | null;
  definition: WorkflowDefinition;
  definition_revision: number | null;
  inputs: Record<string, unknown>;
  trigger_type: TriggerType;
  routine_id: string | null;
  locale: string;
  /** Library principals a retrieval inside this run may use: `workspace`, `workflow:<id>`, `agent:<slug>`. */
  library_principals: string[];
  budget: RunBudget;
}

export interface RunAccepted {
  run_id: string;
  status: RunStatus;
}

export interface EngineStepSnapshot {
  step_key: string;
  step_type: string;
  position: number;
  status: StepStatus;
  attempt: number;
  progress: { current: number; total: number } | null;
  output_preview: string | null;
  error_code: string | null;
  credits: number;
  approval_id: string | null;
  started_at: string | null;
  finished_at: string | null;
}

/** sineva-ai's authoritative view of a run. */
export interface RunSnapshot {
  run_id: string;
  status: RunStatus;
  credits_used: number;
  error_code: string | null;
  started_at: string | null;
  finished_at: string | null;
  last_sequence: number;
  steps: EngineStepSnapshot[];
}

export type ResumeMode = 'from_failed_step' | 'continue_after_budget';

/**
 * The platform half of the run contract (ADR-0046). Failure model (ADR-0016):
 * unreachable is `UpstreamUnavailableError` (503), a non-2xx or off-contract
 * answer is `UpstreamServiceError` (502). Nothing here may return invented data.
 */
export interface WorkflowRunGateway {
  startRun(request: StartRunRequest, call: WorkflowRunCall): Promise<RunAccepted>;
  getRun(engineRunId: string, call: WorkflowRunCall): Promise<RunSnapshot>;
  cancelRun(engineRunId: string, call: WorkflowRunCall): Promise<RunAccepted>;
  resumeRun(
    engineRunId: string,
    body: { mode: ResumeMode },
    idempotencyKey: string,
    call: WorkflowRunCall,
  ): Promise<RunAccepted>;
}

// --- what a definition can use here ----------------------------------------

export interface WorkflowConnection {
  id: string;
  provider: string;
  label: string;
  connected: boolean;
}

/**
 * Facts the validator needs. The connector registry and the Tool Gateway
 * (M2) are not on this base, so the shipped adapter reports no connections and
 * no actions; the builder then says what is missing instead of faking a list.
 */
export interface WorkflowCatalog {
  /** Null when sineva-ai could not be asked: "unknown", never a guess. */
  enabledSpecialists(context: RequestContext): Promise<string[] | null>;
  connections(workspaceId: string): Promise<WorkflowConnection[]>;
  /** Keyed `provider:action_id`. */
  actions(): Promise<Record<string, ActionMeta>>;
}

// --- logging ---------------------------------------------------------------

export type WorkflowLogEvent =
  | 'workflow.run_start_failed'
  | 'workflow.run_event_ignored'
  | 'workflow.run_reconcile_failed';

/** Ids, codes and counts only: never step text, inputs or outputs. */
export interface WorkflowLogFields {
  workspace_id?: string;
  run_handle?: string;
  reason?: string;
  code?: string;
  status?: number;
}

export interface WorkflowLog {
  warn(event: WorkflowLogEvent, fields: WorkflowLogFields): void;
}
