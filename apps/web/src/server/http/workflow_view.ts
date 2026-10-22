import type { WorkflowListEntry } from '@/server/application/use-cases/workflows/list_workflows_use_case';
import type { WorkflowRunDetail } from '@/server/application/use-cases/workflows/get_workflow_run_use_case';
import { specialistsOf, stepCountOf } from '@/server/application/workflows/workflow_support';
import type {
  WorkflowEntity,
  WorkflowRunEntity,
  WorkflowRunStepEntity,
  WorkflowVersionEntity,
} from '@/server/domain/workflows/workflow';
import type { Step, WorkflowDefinition } from '@/shared/workflows/definition';
import type { WorkflowIssue } from '@/shared/workflows/validate';
import type {
  WorkflowDetailView,
  WorkflowPlanStepView,
  WorkflowRunDetailView,
  WorkflowRunStepView,
  WorkflowRunView,
  WorkflowVersionView,
  WorkflowView,
} from '@/shared/workflows/workflow_view';

/**
 * The one place a Workflow entity becomes wire JSON. The run snapshot, the
 * inputs and the instructions of a run stay out of the list shapes on purpose:
 * a list needs names and states, not what a step was told to do.
 */
export function toWorkflowView(entry: {
  workflow: WorkflowEntity;
  last_run: WorkflowListEntry['last_run'];
  attention: WorkflowIssue[] | null;
}): WorkflowView {
  const { workflow, last_run, attention } = entry;
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    status: workflow.status,
    needs_attention: attention === null ? null : attention.length > 0,
    attention: attention ?? [],
    version: workflow.current_version_number,
    template_slug: workflow.template_slug,
    created_by: workflow.created_by,
    step_count: stepCountOf(workflow.draft_definition),
    specialists: specialistsOf(workflow.draft_definition),
    draft_revision: workflow.draft_revision,
    last_run: last_run
      ? {
          id: last_run.id,
          status: last_run.status,
          mode: last_run.mode,
          started_at: last_run.started_at,
          finished_at: last_run.finished_at,
        }
      : null,
    created_at: workflow.created_at,
    updated_at: workflow.updated_at,
  };
}

export function toWorkflowDetailView(
  detail: {
    workflow: WorkflowEntity;
    issues: WorkflowIssue[];
    attention: WorkflowIssue[] | null;
    tested_current_draft: boolean;
    catalog_known: boolean;
  },
  lastRun: WorkflowListEntry['last_run'] = null,
): WorkflowDetailView {
  return {
    ...toWorkflowView({ workflow: detail.workflow, last_run: lastRun, attention: detail.attention }),
    definition: detail.workflow.draft_definition,
    issues: detail.issues,
    tested_current_draft: detail.tested_current_draft,
    catalog_known: detail.catalog_known,
  };
}

export function toWorkflowVersionView(entity: WorkflowVersionEntity): WorkflowVersionView {
  return {
    id: entity.id,
    version_number: entity.version_number,
    note: entity.note,
    restored_from: entity.restored_from,
    published_by: entity.published_by,
    published_at: entity.published_at,
    step_count: stepCountOf(entity.definition),
  };
}

export function toWorkflowRunView(run: WorkflowRunEntity, workflowName: string): WorkflowRunView {
  return {
    id: run.id,
    workflow_id: run.workflow_id,
    workflow_name: workflowName,
    mode: run.mode,
    status: run.status,
    started_by: run.started_by,
    trigger_type: run.trigger_type,
    version_number: run.version_number,
    credits_estimated: run.credits_estimated,
    credits_used: run.credits_used,
    error_code: run.error_code,
    started_at: run.started_at,
    finished_at: run.finished_at,
    created_at: run.created_at,
  };
}

function planOf(definition: WorkflowDefinition): WorkflowPlanStepView[] {
  const plan: WorkflowPlanStepView[] = [];
  const add = (step: Step, parentKey: string | null) => {
    plan.push({
      key: step.key,
      type: step.type,
      title: step.title,
      specialist: step.type === 'specialist_task' || step.type === 'skill' ? step.specialist : null,
      parent_key: parentKey,
    });
    if (step.type === 'loop') for (const child of step.body) add(child, step.key);
  };
  for (const step of definition.steps ?? []) add(step, null);
  return plan;
}

function toStepView(step: WorkflowRunStepEntity): WorkflowRunStepView {
  return {
    step_key: step.step_key,
    status: step.status,
    attempt: step.attempt,
    progress:
      step.progress_current !== null && step.progress_total !== null
        ? { current: step.progress_current, total: step.progress_total }
        : null,
    credits: step.credits,
    error_code: step.error_code,
    approval_id: step.approval_id,
    started_at: step.started_at,
    finished_at: step.finished_at,
    // The use case already blanked these for roles without `workflow.trace.view`.
    output_preview: step.output_preview,
    trace: step.trace,
  };
}

export function toWorkflowRunDetailView(detail: WorkflowRunDetail): WorkflowRunDetailView {
  return {
    ...toWorkflowRunView(detail.run, detail.workflow_name),
    plan: planOf(detail.run.definition),
    steps: detail.steps.map(toStepView),
    engine_reachable: detail.engine_reachable,
  };
}
