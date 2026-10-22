import type { WorkflowDefinition } from '@/shared/workflows/definition';
import type { RunMode, RunStatus, TriggerType } from '@/shared/workflows/run_state';
import type {
  RunPatch,
  StepPatch,
  WorkflowEntity,
  WorkflowListItem,
  WorkflowRunEntity,
  WorkflowRunStepEntity,
  WorkflowStatus,
  WorkflowVersionEntity,
} from '@/server/domain/workflows/workflow';

// Ports of the Workflow tables. Every method takes the workspace id and
// filters on it, so a row of another workspace is simply not found (404, never
// 403). Adapters join an active transaction scope when there is one.

export interface NewWorkflow {
  workspace_id: string;
  name: string;
  description: string | null;
  definition: WorkflowDefinition;
  template_slug: string | null;
  created_by: string;
}

export interface WorkflowListFilter {
  q?: string;
  /** `needs_attention` is computed by the use case, not stored, so it never reaches here. */
  status?: WorkflowStatus;
  /** Archived ones are left out unless asked for. */
  include_archived?: boolean;
  limit: number;
  offset: number;
}

export interface WorkflowDraftPatch {
  name?: string;
  description?: string | null;
  definition?: WorkflowDefinition;
}

export interface WorkflowRepository {
  create(input: NewWorkflow): Promise<WorkflowEntity>;
  findById(workspaceId: string, id: string): Promise<WorkflowEntity | null>;
  list(workspaceId: string, filter: WorkflowListFilter): Promise<{ items: WorkflowListItem[]; total: number }>;
  /** Names for run lists, in one read instead of one per row. Missing ids are simply absent. */
  namesByIds(workspaceId: string, ids: readonly string[]): Promise<Map<string, string>>;
  /** Not archived or deleted ones, for the plan limit. */
  countActive(workspaceId: string): Promise<number>;
  /**
   * Compare and set on the revision: null when `expectedRevision` is stale (or
   * the row is gone), so the use case can tell the person who got there first.
   * Bumps `draft_revision` only when the definition changed.
   */
  updateDraft(
    workspaceId: string,
    id: string,
    patch: WorkflowDraftPatch,
    expectedRevision: number,
  ): Promise<WorkflowEntity | null>;
  /** Used by restore, which replaces the draft with an old definition and bumps the revision. */
  replaceDraft(workspaceId: string, id: string, definition: WorkflowDefinition): Promise<WorkflowEntity>;
  markPublished(workspaceId: string, id: string, versionId: string): Promise<WorkflowEntity>;
  archive(workspaceId: string, id: string, at: Date): Promise<WorkflowEntity>;
  delete(workspaceId: string, id: string): Promise<void>;
}

export interface NewWorkflowVersion {
  workflow_id: string;
  workspace_id: string;
  definition: WorkflowDefinition;
  note: string | null;
  restored_from: number | null;
  published_by: string;
}

export interface WorkflowVersionRepository {
  /** Takes the next number atomically; two publishes at once get two numbers, never one. */
  create(input: NewWorkflowVersion): Promise<WorkflowVersionEntity>;
  list(workspaceId: string, workflowId: string): Promise<WorkflowVersionEntity[]>;
  findById(workspaceId: string, workflowId: string, id: string): Promise<WorkflowVersionEntity | null>;
}

export interface NewWorkflowRun {
  workspace_id: string;
  workflow_id: string;
  version_id: string | null;
  version_number: number | null;
  draft_revision: number | null;
  engine_run_id: string;
  mode: RunMode;
  started_by: string;
  trigger_type: TriggerType;
  routine_id: string | null;
  inputs: Record<string, unknown>;
  definition: WorkflowDefinition;
}

export interface WorkflowRunFilter {
  workflow_id?: string;
  status?: RunStatus;
  mode?: RunMode;
  limit: number;
  offset: number;
}

export interface WorkflowRunRepository {
  create(input: NewWorkflowRun): Promise<WorkflowRunEntity>;
  findById(workspaceId: string, id: string): Promise<WorkflowRunEntity | null>;
  /** The id sineva-ai knows. The caller must check the workspace claim itself. */
  findByEngineRunId(engineRunId: string): Promise<WorkflowRunEntity | null>;
  list(workspaceId: string, filter: WorkflowRunFilter): Promise<{ items: WorkflowRunEntity[]; total: number }>;
  update(workspaceId: string, id: string, patch: RunPatch): Promise<WorkflowRunEntity>;
  delete(workspaceId: string, id: string): Promise<void>;
  hasRuns(workspaceId: string, workflowId: string): Promise<boolean>;
  /** A test run that succeeded on exactly this draft revision (FR-WF-20). */
  hasSucceededTest(workspaceId: string, workflowId: string, draftRevision: number): Promise<boolean>;
  /** Compare and set: true only when `sequence` is higher than the stored one. */
  advanceSequence(workspaceId: string, id: string, sequence: number): Promise<boolean>;
  upsertStep(workspaceId: string, runId: string, patch: StepPatch): Promise<WorkflowRunStepEntity>;
  listSteps(workspaceId: string, runId: string): Promise<WorkflowRunStepEntity[]>;
  /** Stores what sineva-ai said. `inserted` is false for an event id seen before. */
  recordEvent(input: {
    workspace_id: string;
    run_id: string;
    event_id: string;
    sequence: number;
    type: string;
    applied: boolean;
  }): Promise<{ inserted: boolean }>;
}
