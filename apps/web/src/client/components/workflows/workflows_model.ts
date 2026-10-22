import type { Step, StepType, WorkflowDefinition } from '@/shared/workflows/definition';
import type { WorkflowIssue } from '@/shared/workflows/validate';
import type { RunStatus, StepStatus } from '@/shared/workflows/run_state';
import type { WorkflowPlanStepView, WorkflowRunStepView } from '@/shared/workflows/workflow_view';

export interface StepAddress {
  /** Index of the loop this step sits in, or null at the top level. */
  parent: number | null;
  index: number;
}

export interface RefChoice {
  ref: string;
  kind: 'input' | 'step' | 'item';
  key: string;
  label: string;
}

export interface TimelineRow {
  key: string;
  title: string;
  type: StepType;
  specialist: string | null;
  parent_key: string | null;
  status: StepStatus;
  attempt: number;
  progress: { current: number; total: number } | null;
  credits: number;
  error_code: string | null;
  approval_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  output_preview: string | null;
}

const NOT_IMPLEMENTED = 'not implemented';

export function stepAt(_definition: WorkflowDefinition, _address: StepAddress): Step | undefined {
  throw new Error(NOT_IMPLEMENTED);
}
export function insertStep(_definition: WorkflowDefinition, _parent: number | null, _index: number, _step: Step): WorkflowDefinition {
  throw new Error(NOT_IMPLEMENTED);
}
export function replaceStep(_definition: WorkflowDefinition, _address: StepAddress, _step: Step): WorkflowDefinition {
  throw new Error(NOT_IMPLEMENTED);
}
export function removeStep(_definition: WorkflowDefinition, _address: StepAddress): WorkflowDefinition {
  throw new Error(NOT_IMPLEMENTED);
}
export function moveStep(_definition: WorkflowDefinition, _address: StepAddress, _to: number): WorkflowDefinition {
  throw new Error(NOT_IMPLEMENTED);
}
export function uniqueStepKey(_definition: WorkflowDefinition, _base: string): string {
  throw new Error(NOT_IMPLEMENTED);
}
export function newStep(_type: StepType, _definition: WorkflowDefinition, _inLoop: boolean): Step {
  throw new Error(NOT_IMPLEMENTED);
}
export function canAddStep(_definition: WorkflowDefinition): boolean {
  throw new Error(NOT_IMPLEMENTED);
}
export function isReferenced(_definition: WorkflowDefinition, _key: string): boolean {
  throw new Error(NOT_IMPLEMENTED);
}
export function referenceChoices(_definition: WorkflowDefinition, _address: StepAddress | null): RefChoice[] {
  throw new Error(NOT_IMPLEMENTED);
}
export function sanitizeRefs(_text: string): string {
  throw new Error(NOT_IMPLEMENTED);
}
export function insertRef(_text: string, _ref: string, _at: number): { text: string; caret: number } {
  throw new Error(NOT_IMPLEMENTED);
}
export function issuesByStep(_issues: readonly WorkflowIssue[]): Map<string | null, WorkflowIssue[]> {
  throw new Error(NOT_IMPLEMENTED);
}
export function timelineRows(_plan: readonly WorkflowPlanStepView[], _steps: readonly WorkflowRunStepView[]): TimelineRow[] {
  throw new Error(NOT_IMPLEMENTED);
}
export function totalCredits(_rows: readonly TimelineRow[]): number {
  throw new Error(NOT_IMPLEMENTED);
}
export function firstFailedStep(_rows: readonly TimelineRow[]): TimelineRow | null {
  throw new Error(NOT_IMPLEMENTED);
}
export function runTone(_status: RunStatus): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  throw new Error(NOT_IMPLEMENTED);
}
