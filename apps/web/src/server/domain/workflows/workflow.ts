import type { WorkflowDefinition } from '@/shared/workflows/definition';
import type { RunMode, RunStatus, StepStatus, TriggerType } from '@/shared/workflows/run_state';

// Entities of the Workflow feature (ADR-0045, ADR-0046). Dates are ISO strings
// so they cross the layers without a driver type.

export type WorkflowStatus = 'draft' | 'published' | 'archived';

export interface WorkflowEntity {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  draft_definition: WorkflowDefinition;
  draft_revision: number;
  current_version_id: string | null;
  /** Number of `current_version_id`, joined by the repository. */
  current_version_number: number | null;
  template_slug: string | null;
  created_by: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowVersionEntity {
  id: string;
  workflow_id: string;
  workspace_id: string;
  version_number: number;
  definition: WorkflowDefinition;
  schema_version: number;
  note: string | null;
  restored_from: number | null;
  published_by: string;
  published_at: string;
}

export interface WorkflowRunEntity {
  id: string;
  workspace_id: string;
  workflow_id: string;
  version_id: string | null;
  version_number: number | null;
  draft_revision: number | null;
  engine_run_id: string;
  mode: RunMode;
  status: RunStatus;
  started_by: string;
  trigger_type: TriggerType;
  routine_id: string | null;
  inputs: Record<string, unknown>;
  definition: WorkflowDefinition;
  credits_estimated: number | null;
  credits_used: number;
  error_code: string | null;
  last_event_seq: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRunStepEntity {
  id: string;
  run_id: string;
  workspace_id: string;
  step_key: string;
  position: number;
  step_type: string;
  status: StepStatus;
  attempt: number;
  progress_current: number | null;
  progress_total: number | null;
  output_preview: string | null;
  trace: unknown;
  error_code: string | null;
  credits: number;
  approval_id: string | null;
  started_at: string | null;
  finished_at: string | null;
}

/** The newest run of a workflow, for the list. */
export interface WorkflowLastRun {
  id: string;
  status: RunStatus;
  mode: RunMode;
  started_at: string | null;
  finished_at: string | null;
}

export interface WorkflowListItem {
  workflow: WorkflowEntity;
  last_run: WorkflowLastRun | null;
}

/** The part of a step event the repository stores (ADR-0046 point 2). */
export interface StepPatch {
  step_key: string;
  position: number;
  step_type: string;
  status: StepStatus;
  attempt?: number;
  progress?: { current: number; total: number } | null;
  output_preview?: string | null;
  trace?: unknown;
  error_code?: string | null;
  credits?: number;
  approval_id?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface RunPatch {
  status?: RunStatus;
  credits_used?: number;
  error_code?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  credits_estimated?: number | null;
}
