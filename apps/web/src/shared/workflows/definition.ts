// The Workflow definition format (ADR-0045). Pure types and constants: no
// server code, so the builder, the API and the validator share one shape.
// Everything is snake_case because the same JSON is validated by sineva-ai.

export const WORKFLOW_SCHEMA_VERSION = 1;

/** Steps per Workflow, loop bodies included (FR-WF-04). */
export const MAX_WORKFLOW_STEPS = 12;
export const DEFAULT_LOOP_CAP = 25;
/** What an Admin may raise the loop cap to, with a cost warning in the UI. */
export const MAX_LOOP_CAP = 100;
export const MAX_WAIT_HOURS = 7 * 24;
export const MAX_REVIEW_EXPIRY_DAYS = 7;
export const MAX_TEXT_LENGTH = 4000;

export const STEP_TYPES = [
  'specialist_task',
  'skill',
  'connection_action',
  'review',
  'condition',
  'wait',
  'loop',
  'ask_me',
  'squad_task',
] as const;
export type StepType = (typeof STEP_TYPES)[number];

/** Known to the schema, refused by the validator until the feature ships (Skills, M2; Squads, M4). */
export const RESERVED_STEP_TYPES: readonly StepType[] = ['skill', 'squad_task'];

/** What a person can add in the builder today, in picker order. */
export const PICKABLE_STEP_TYPES: readonly StepType[] = [
  'specialist_task',
  'connection_action',
  'review',
  'condition',
  'ask_me',
  'wait',
  'loop',
];

/** Types allowed inside a loop body: a loop cannot hold a loop, and a wait per item has no use in v1. */
export const LOOP_BODY_TYPES: readonly StepType[] = [
  'specialist_task',
  'connection_action',
  'review',
  'condition',
  'ask_me',
];

/** Specialists a Workflow step may use in M3 (wave 1). The orchestrator `sino` is not one. */
export const WORKFLOW_SPECIALISTS = [
  'sinopeople',
  'sinofinance',
  'sinosales',
  'sinosocial',
  'sinohelp',
  'sinoinsights',
] as const;

export const OUTPUT_TYPES = ['text', 'number', 'list', 'record', 'file'] as const;
export type OutputType = (typeof OUTPUT_TYPES)[number];

export const INPUT_TYPES = ['text', 'number', 'date', 'library_file', 'choice'] as const;
export type InputType = (typeof INPUT_TYPES)[number];

export const CONDITION_OPS = [
  'is_empty',
  'is_not_empty',
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'contains',
] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

/** Operators that take no right-hand value. */
export const UNARY_CONDITION_OPS: readonly ConditionOp[] = ['is_empty', 'is_not_empty'];

export const KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

export interface WorkflowInput {
  key: string;
  type: InputType;
  label: string;
  required: boolean;
  default?: string | number | null;
  /** `choice` only. */
  options?: string[];
  /** `library_file` only: up to 25 files make a list. */
  multiple?: boolean;
}

interface StepBase {
  key: string;
  title: string;
}

export interface SpecialistTaskStep extends StepBase {
  type: 'specialist_task';
  specialist: string;
  instruction: string;
  output_type: OutputType;
}

export interface SkillStep extends StepBase {
  type: 'skill';
  specialist: string;
  skill_id: string;
  params: Record<string, string>;
  output_type: OutputType;
}

export interface ConnectionActionStep extends StepBase {
  type: 'connection_action';
  /** Null until a connection is picked. */
  connection_id: string | null;
  provider: string;
  action_id: string;
  args: Record<string, string>;
  output_type: OutputType;
}

export interface ReviewStep extends StepBase {
  type: 'review';
  instruction: string;
  /** Reference to the drafts to review; the run output is the approved ones. */
  subject: string | null;
  expiry_days: number;
  on_reject: 'end' | 'continue';
  output_type: OutputType;
}

export interface ConditionStep extends StepBase {
  type: 'condition';
  check: { left: string; op: ConditionOp; right?: string };
  /** The run goes on only when the check is true; otherwise it ends. */
  if_not: 'end';
  end_note?: string;
}

export interface WaitStep extends StepBase {
  type: 'wait';
  duration_hours: number;
  or_reply: boolean;
}

export interface LoopStep extends StepBase {
  type: 'loop';
  over: string;
  cap: number;
  body: Step[];
}

export interface AskMeStep extends StepBase {
  type: 'ask_me';
  question: string;
  answer: 'choice' | 'text';
  choices?: string[];
  /** Ask once per item of this list instead of once. */
  per_item_of: string | null;
  output_type: OutputType;
}

export interface SquadTaskStep extends StepBase {
  type: 'squad_task';
  squad_id: string;
  instruction: string;
  output_type: OutputType;
}

export type Step =
  | SpecialistTaskStep
  | SkillStep
  | ConnectionActionStep
  | ReviewStep
  | ConditionStep
  | WaitStep
  | LoopStep
  | AskMeStep
  | SquadTaskStep;

export interface WorkflowOutput {
  key: string;
  from: string;
}

export interface WorkflowDefinition {
  schema_version: number;
  inputs: WorkflowInput[];
  steps: Step[];
  outputs: WorkflowOutput[];
  limits: { loop_cap?: number };
}

export function emptyDefinition(): WorkflowDefinition {
  return { schema_version: WORKFLOW_SCHEMA_VERSION, inputs: [], steps: [], outputs: [], limits: {} };
}

/** Steps that leave something a later step can reference. A wait leaves the reply it waited for (empty when none came). */
export const OUTPUT_STEP_TYPES: readonly StepType[] = [
  'specialist_task',
  'skill',
  'connection_action',
  'review',
  'ask_me',
  'loop',
  'wait',
  'squad_task',
];

export function producesOutput(type: StepType): boolean {
  return OUTPUT_STEP_TYPES.includes(type);
}

/** Every step in run order, loop bodies right after their loop. */
export function flattenSteps(steps: readonly Step[]): Step[] {
  return steps.flatMap((step) => (step.type === 'loop' ? [step, ...flattenSteps(step.body ?? [])] : [step]));
}

export function countSteps(steps: readonly Step[]): number {
  return flattenSteps(steps).length;
}
