import type { StepType, WorkflowDefinition } from './definition';
import type { RunMode, RunStatus, StepStatus, TriggerType } from './run_state';
import type { ActionClass, WorkflowIssue } from './validate';

// What the browser reads about Workflows. Server shapes are checked against
// these in `server/http/workflow_view_contract.ts` (R-14).

export type WorkflowStatusView = 'draft' | 'published' | 'archived';

export interface WorkflowLastRunView {
  id: string;
  status: RunStatus;
  mode: RunMode;
  started_at: string | null;
  finished_at: string | null;
}

export interface WorkflowView {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowStatusView;
  /** A specialist is off or an app is not connected (FR-WF-27). Null when it cannot be known right now. */
  needs_attention: boolean | null;
  attention: WorkflowIssue[];
  /** Newest published version, null until the first publish. */
  version: number | null;
  template_slug: string | null;
  created_by: string;
  step_count: number;
  specialists: string[];
  draft_revision: number;
  last_run: WorkflowLastRunView | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowDetailView extends WorkflowView {
  definition: WorkflowDefinition;
  /** What stops a publish or a run right now, same codes the builder shows. */
  issues: WorkflowIssue[];
  /** A test run succeeded on exactly this draft (FR-WF-20). */
  tested_current_draft: boolean;
  /** Whether sineva-ai could be asked about specialists. False means "needs attention" is unknown. */
  catalog_known: boolean;
}

export interface WorkflowVersionView {
  id: string;
  version_number: number;
  note: string | null;
  restored_from: number | null;
  published_by: string;
  published_at: string;
  step_count: number;
}

export interface WorkflowTemplateRequirementView {
  provider: string;
  label: string;
  optional: boolean;
  connected: boolean;
}

export interface WorkflowTemplateView {
  slug: string;
  name: string;
  summary: string;
  guardrail: string;
  specialists: string[];
  /** Specialists that are off here. */
  missing_specialists: string[];
  requirements: WorkflowTemplateRequirementView[];
  step_count: number;
  review_count: number;
}

export interface WorkflowCatalogActionView {
  provider: string;
  action_id: string;
  class: ActionClass;
}

export interface WorkflowCatalogView {
  /** Null when sineva-ai could not be asked. */
  enabled_specialists: string[] | null;
  connections: Array<{ id: string; provider: string; label: string; connected: boolean }>;
  actions: WorkflowCatalogActionView[];
}

export interface WorkflowPlanStepView {
  key: string;
  type: StepType;
  title: string;
  specialist: string | null;
  /** Key of the loop this step runs inside, if any. */
  parent_key: string | null;
}

export interface WorkflowRunStepView {
  step_key: string;
  status: StepStatus;
  attempt: number;
  progress: { current: number; total: number } | null;
  credits: number;
  error_code: string | null;
  approval_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  /** Only with `workflow.trace.view`; null for everyone else. */
  output_preview: string | null;
  trace: unknown;
}

export interface WorkflowRunView {
  id: string;
  workflow_id: string;
  workflow_name: string;
  mode: RunMode;
  status: RunStatus;
  started_by: string;
  trigger_type: TriggerType;
  version_number: number | null;
  credits_estimated: number | null;
  credits_used: number;
  error_code: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface WorkflowRunDetailView extends WorkflowRunView {
  plan: WorkflowPlanStepView[];
  steps: WorkflowRunStepView[];
  /** False when sineva-ai could not confirm the state just now; what is shown is the last it said. */
  engine_reachable: boolean;
}

export interface WorkflowListView {
  items: WorkflowView[];
  total: number;
  page: number;
  per_page: number;
}

export interface WorkflowRunListView {
  items: WorkflowRunView[];
  total: number;
  page: number;
  per_page: number;
}
