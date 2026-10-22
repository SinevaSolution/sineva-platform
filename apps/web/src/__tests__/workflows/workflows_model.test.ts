import { describe, expect, it } from 'vitest';
import {
  canAddStep,
  firstFailedStep,
  insertRef,
  insertStep,
  isReferenced,
  issuesByStep,
  moveStep,
  newStep,
  referenceChoices,
  removeStep,
  replaceStep,
  runTone,
  sanitizeRefs,
  stepAt,
  timelineRows,
  totalCredits,
  uniqueStepKey,
} from '@/client/components/workflows/workflows_model';
import {
  MAX_WORKFLOW_STEPS,
  emptyDefinition,
  flattenSteps,
  type Step,
  type WorkflowDefinition,
} from '@/shared/workflows/definition';
import { validateWorkflowDefinition } from '@/shared/workflows/validate';
import type { RunStatus } from '@/shared/workflows/run_state';
import type { WorkflowPlanStepView, WorkflowRunStepView } from '@/shared/workflows/workflow_view';
import snapshotFailed from '../contract/fixtures/workflow_run_snapshot_failed_step.json';
import snapshotReview from '../contract/fixtures/workflow_run_snapshot_needs_review.json';

// WP-M3-12 (the builder's rules) and WP-M3-13 (what a run screen shows). The UI
// state lives in pure functions so a drag, a key press and a click all reach
// the same code, and so the rules are tested without a browser.

const specialist = (key: string, extra: Partial<Step> = {}): Step =>
  ({
    key,
    type: 'specialist_task',
    title: key,
    specialist: 'sinofinance',
    instruction: 'Do it',
    output_type: 'text',
    ...extra,
  }) as Step;

const loopOf = (key: string, body: Step[]): Step => ({ key, type: 'loop', title: key, over: '{{inputs.files}}', cap: 25, body });

function definition(steps: Step[]): WorkflowDefinition {
  return {
    ...emptyDefinition(),
    inputs: [{ key: 'files', type: 'library_file', label: 'Files', required: true, multiple: true }],
    steps,
  };
}

describe('editing the step list', () => {
  it('inserts, replaces and removes at the top level and inside a loop, without touching the input', () => {
    const start = definition([specialist('a'), loopOf('each', [specialist('inner')])]);
    const frozen = JSON.stringify(start);

    const inserted = insertStep(start, null, 1, specialist('b'));
    expect(inserted.steps.map((s) => s.key)).toEqual(['a', 'b', 'each']);
    const intoLoop = insertStep(start, 1, 1, specialist('inner2'));
    expect((intoLoop.steps[1] as { body: Step[] }).body.map((s) => s.key)).toEqual(['inner', 'inner2']);

    const replaced = replaceStep(start, { parent: 1, index: 0 }, specialist('inner', { title: 'Renamed' }));
    expect(stepAt(replaced, { parent: 1, index: 0 })).toMatchObject({ title: 'Renamed' });
    expect(removeStep(start, { parent: null, index: 0 }).steps.map((s) => s.key)).toEqual(['each']);
    expect((removeStep(start, { parent: 1, index: 0 }).steps[1] as { body: Step[] }).body).toEqual([]);

    expect(JSON.stringify(start)).toBe(frozen);
  });

  it('moves a step to a position in its own list (drag, and the move up and down buttons)', () => {
    const start = definition([specialist('a'), specialist('b'), specialist('c')]);
    expect(moveStep(start, { parent: null, index: 0 }, 2).steps.map((s) => s.key)).toEqual(['b', 'c', 'a']);
    expect(moveStep(start, { parent: null, index: 2 }, 0).steps.map((s) => s.key)).toEqual(['c', 'a', 'b']);
    expect(moveStep(start, { parent: null, index: 1 }, 1)).toBe(start);
    // Out of range is clamped, never a hole in the list.
    expect(moveStep(start, { parent: null, index: 0 }, 99).steps.map((s) => s.key)).toEqual(['b', 'c', 'a']);
    expect(moveStep(start, { parent: null, index: 0 }, -5)).toBe(start);

    const nested = definition([loopOf('each', [specialist('x'), specialist('y')])]);
    expect((moveStep(nested, { parent: 0, index: 0 }, 1).steps[0] as { body: Step[] }).body.map((s) => s.key)).toEqual(['y', 'x']);
  });

  it('makes keys that are unique across the whole definition, loop bodies included', () => {
    const start = definition([specialist('step_1'), loopOf('each', [specialist('step_2')])]);
    expect(uniqueStepKey(start, 'step')).toBe('step_3');
    expect(uniqueStepKey(start, 'summary')).toBe('summary');
    expect(uniqueStepKey(definition([specialist('summary')]), 'summary')).toBe('summary_2');
  });

  it('creates every pickable step type so the validator has only the blanks to complain about', () => {
    const start = definition([]);
    for (const type of ['specialist_task', 'connection_action', 'review', 'condition', 'ask_me', 'wait', 'loop'] as const) {
      const step = newStep(type, start, false);
      expect(step.type).toBe(type);
      expect(step.key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
    const loop = newStep('loop', start, false);
    expect(loop).toMatchObject({ cap: 25, body: [] });
    expect(newStep('wait', start, false)).toMatchObject({ duration_hours: 24, or_reply: false });
    expect(newStep('review', start, false)).toMatchObject({ expiry_days: 7, on_reject: 'end' });
  });

  it('a new step is only the blanks a person must fill: an empty instruction, nothing guessed', () => {
    const step = newStep('specialist_task', definition([]), false);
    expect(step).toMatchObject({ instruction: '' });
    const result = validateWorkflowDefinition(definition([step]), { actions: {} });
    expect(result.issues.map((i) => i.code)).toEqual(['field_required']);
  });

  it('stops at 12 steps counting loop bodies, like the validator', () => {
    const eleven = definition(Array.from({ length: MAX_WORKFLOW_STEPS - 1 }, (_, i) => specialist(`s${i}`)));
    expect(canAddStep(eleven)).toBe(true);
    expect(canAddStep(insertStep(eleven, null, 0, specialist('last')))).toBe(false);
    const withLoop = definition([loopOf('each', Array.from({ length: 10 }, (_, i) => specialist(`b${i}`)))]);
    expect(flattenSteps(withLoop.steps)).toHaveLength(11);
    expect(canAddStep(withLoop)).toBe(true);
  });

  it('knows whether a later step reads a step, so delete can ask first', () => {
    const start = definition([specialist('a'), specialist('b', { instruction: 'Use {{steps.a.output}}' }), specialist('c')]);
    expect(isReferenced(start, 'a')).toBe(true);
    expect(isReferenced(start, 'c')).toBe(false);
    expect(isReferenced(start, 'b')).toBe(false);
  });
});

describe('the variable picker offers only what a step can use (FR-WF-14)', () => {
  const start: WorkflowDefinition = {
    ...definition([
      specialist('first'),
      { key: 'pause', type: 'condition', title: 'C', check: { left: '{{steps.first.output}}', op: 'is_not_empty' }, if_not: 'end' },
      loopOf('each', [specialist('inner')]),
      specialist('last'),
    ]),
    inputs: [
      { key: 'days', type: 'number', label: 'Days overdue', required: true },
      { key: 'files', type: 'library_file', label: 'Files', required: true, multiple: true },
    ],
  };

  it('offers inputs and earlier steps that leave an output, never itself, later steps or a condition', () => {
    const choices = referenceChoices(start, { parent: null, index: 3 });
    expect(choices.map((c) => c.ref)).toEqual([
      '{{inputs.days}}',
      '{{inputs.files}}',
      '{{steps.first.output}}',
      '{{steps.each.output}}',
    ]);
    expect(choices.find((c) => c.key === 'days')).toMatchObject({ kind: 'input', label: 'Days overdue' });
  });

  it('offers the current item and earlier steps of the same loop only inside a loop body', () => {
    const body = referenceChoices(start, { parent: 2, index: 0 }).map((c) => c.ref);
    expect(body).toContain('{{loop.item}}');
    expect(body).toContain('{{steps.first.output}}');
    expect(body).not.toContain('{{steps.each.output}}');
    expect(referenceChoices(start, { parent: null, index: 0 }).map((c) => c.ref)).not.toContain('{{loop.item}}');
  });

  it('with no address (the workflow outputs) offers everything that exists', () => {
    expect(referenceChoices(start, null).map((c) => c.ref)).toContain('{{steps.last.output}}');
  });

  it('every offered reference passes the shared validator', () => {
    for (const choice of referenceChoices(start, { parent: null, index: 3 })) {
      const candidate = replaceStep(start, { parent: null, index: 3 }, specialist('last', { instruction: `See ${choice.ref}` }));
      const issues = validateWorkflowDefinition(candidate, { actions: {} }).issues.filter((i) => i.code.startsWith('reference_'));
      expect(issues, choice.ref).toEqual([]);
    }
  });
});

describe('free-typed references are not possible (WP-M3-12 do not)', () => {
  it('keeps complete picker references and drops anything typed by hand', () => {
    expect(sanitizeRefs('Hello {{steps.a.output}} and {{inputs.days}}')).toBe('Hello {{steps.a.output}} and {{inputs.days}}');
    expect(sanitizeRefs('Hello {{loop.item}}!')).toBe('Hello {{loop.item}}!');
    expect(sanitizeRefs('Use {{secrets.api_token}} here')).toBe('Use  here');
    expect(sanitizeRefs('Use {{ steps.a.output }} here')).toBe('Use {{steps.a.output}} here');
    expect(sanitizeRefs('{not a ref}')).toBe('not a ref');
  });

  it('removes a reference whole when one of its characters was deleted', () => {
    expect(sanitizeRefs('Total {{steps.invoices.output}')).toBe('Total ');
    expect(sanitizeRefs('Total {steps.invoices.output}}')).toBe('Total ');
    expect(sanitizeRefs('Total steps.invoices.output}}')).toBe('Total ');
    expect(sanitizeRefs('Total {{steps.invoices.outpu')).toBe('Total ');
  });

  it('never throws and is stable', () => {
    for (const text of ['', '{{', '}}', '{{}}', 'a{b}c', '{{steps.a.output}}{{steps.a.output}}']) {
      const once = sanitizeRefs(text);
      expect(sanitizeRefs(once)).toBe(once);
    }
  });

  it('inserts a picked reference at the caret and puts the caret after it', () => {
    expect(insertRef('Hello world', '{{inputs.days}}', 6)).toEqual({ text: 'Hello {{inputs.days}}world', caret: 21 });
    expect(insertRef('', '{{loop.item}}', 0)).toEqual({ text: '{{loop.item}}', caret: 13 });
    expect(insertRef('abc', '{{loop.item}}', 99).text).toBe('abc{{loop.item}}');
  });
});

describe('validation shown on the cards', () => {
  it('groups issues by step and keeps the ones about the whole workflow under null', () => {
    const issues = [
      { code: 'field_required', path: 'steps[0].instruction', step_key: 'a', params: {}, needs_attention: false },
      { code: 'specialist_not_enabled', path: 'steps[0].specialist', step_key: 'a', params: {}, needs_attention: true },
      { code: 'no_steps', path: 'steps', step_key: null, params: {}, needs_attention: false },
    ];
    const grouped = issuesByStep(issues);
    expect(grouped.get('a')?.map((i) => i.code)).toEqual(['field_required', 'specialist_not_enabled']);
    expect(grouped.get(null)?.map((i) => i.code)).toEqual(['no_steps']);
  });
});

describe('the run timeline (FR-WF-23, FR-WF-24, FR-WF-26)', () => {
  const plan: WorkflowPlanStepView[] = [
    { key: 'reminder', type: 'specialist_task', title: 'Draft a reminder', specialist: 'sinofinance', parent_key: null },
    { key: 'approval', type: 'review', title: 'Review the reminder', specialist: null, parent_key: null },
    { key: 'summary', type: 'specialist_task', title: 'Summarize', specialist: 'sinoinsights', parent_key: null },
  ];
  const stepsOf = (fixture: unknown): WorkflowRunStepView[] =>
    (fixture as { data: { steps: Array<Record<string, unknown>> } }).data.steps.map((step) => ({
      step_key: step.step_key as string,
      status: step.status as WorkflowRunStepView['status'],
      attempt: step.attempt as number,
      progress: (step.progress as WorkflowRunStepView['progress']) ?? null,
      credits: step.credits as number,
      error_code: (step.error_code as string | null) ?? null,
      approval_id: (step.approval_id as string | null) ?? null,
      started_at: (step.started_at as string | null) ?? null,
      finished_at: (step.finished_at as string | null) ?? null,
      output_preview: (step.output_preview as string | null) ?? null,
      trace: null,
    }));

  it('shows the whole plan in order, steps the engine has not reached yet as waiting', () => {
    const rows = timelineRows(plan, stepsOf(snapshotReview));
    expect(rows.map((r) => [r.key, r.status])).toEqual([
      ['reminder', 'done'],
      ['approval', 'needs_review'],
      ['summary', 'waiting'],
    ]);
    expect(rows[1]).toMatchObject({ approval_id: '70000000-0000-4000-8000-000000000001', title: 'Review the reminder' });
    expect(timelineRows(plan, [])).toHaveLength(3);
    expect(timelineRows(plan, []).every((r) => r.status === 'waiting')).toBe(true);
  });

  it('finds the failed step the resume button restarts from, and only when one failed', () => {
    const failed = timelineRows(plan, stepsOf(snapshotFailed));
    expect(firstFailedStep(failed)).toMatchObject({ key: 'reminder', error_code: 'upstream_unavailable', attempt: 3 });
    expect(firstFailedStep(timelineRows(plan, stepsOf(snapshotReview)))).toBeNull();
  });

  it('adds up what each step cost for the receipt', () => {
    expect(totalCredits(timelineRows(plan, stepsOf(snapshotReview)))).toBe(3);
    expect(totalCredits(timelineRows(plan, []))).toBe(0);
  });

  it('keeps loop body steps under their loop with their depth', () => {
    const nested: WorkflowPlanStepView[] = [
      { key: 'each', type: 'loop', title: 'Each', specialist: null, parent_key: null },
      { key: 'inner', type: 'specialist_task', title: 'Inner', specialist: 'sinofinance', parent_key: 'each' },
    ];
    const rows = timelineRows(nested, [
      { step_key: 'each', status: 'running', attempt: 1, progress: { current: 3, total: 12 }, credits: 0, error_code: null, approval_id: null, started_at: null, finished_at: null, output_preview: null, trace: null },
    ]);
    expect(rows.map((r) => r.parent_key)).toEqual([null, 'each']);
    expect(rows[0]?.progress).toEqual({ current: 3, total: 12 });
  });

  it('maps each run status to one tone', () => {
    const tones: Record<RunStatus, string> = {
      queued: 'neutral',
      running: 'info',
      waiting: 'neutral',
      needs_review: 'warning',
      succeeded: 'success',
      failed: 'danger',
      cancelled: 'neutral',
      budget_exceeded: 'warning',
    };
    for (const [status, tone] of Object.entries(tones)) expect(runTone(status as RunStatus)).toBe(tone);
  });
});
