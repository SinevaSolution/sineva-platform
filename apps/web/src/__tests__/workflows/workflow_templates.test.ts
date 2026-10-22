import { describe, expect, it } from 'vitest';
import { lintCopyString } from '@sineva/i18n';
import {
  flattenSteps,
  type ConnectionActionStep,
  type Step,
  type WorkflowDefinition,
} from '@/shared/workflows/definition';
import {
  PROVIDER_LABELS,
  WORKFLOW_TEMPLATES,
  findWorkflowTemplate,
  releasedTemplates,
} from '@/shared/workflows/templates';
import {
  validateWorkflowDefinition,
  type ActionMeta,
  type ValidationContext,
} from '@/shared/workflows/validate';

// WP-M3-09, gate G3: T1 to T5 validate, pass the lints, and keep each
// specialist's guardrail. The action catalog is the registry the connector work
// will provide; these are the actions the templates ask for.
const ACTIONS: Record<string, ActionMeta> = {
  'jurnal:list_unpaid_invoices': { class: 'read', reads_private: true, reads_external: false },
  'whatsapp:send_message': { class: 'send', reads_private: false, reads_external: false },
  'email:send_message': { class: 'send', reads_private: false, reads_external: false },
  'instagram:schedule_post': { class: 'write', reads_private: false, reads_external: false },
  'google_calendar:create_hold': { class: 'write', reads_private: false, reads_external: false },
};
const LOCALE_CODES = ['id', 'en'] as const;
const WAVE1 = ['sinopeople', 'sinofinance', 'sinosales', 'sinosocial', 'sinohelp', 'sinoinsights'];
const connectionsFor = (definition: WorkflowDefinition) => {
  const providers = new Set(
    flattenSteps(definition.steps)
      .filter((s): s is ConnectionActionStep => s.type === 'connection_action')
      .map((s) => s.provider),
  );
  return [...providers].map((provider) => ({ id: `id-${provider}`, provider, connected: true }));
};
/** The definition with every connection picked, as it would be after the owner connected the apps. */
function withConnections(definition: WorkflowDefinition): WorkflowDefinition {
  const fill = (steps: Step[]): Step[] =>
    steps.map((step) => {
      if (step.type === 'connection_action') return { ...step, connection_id: `id-${step.provider}` };
      if (step.type === 'loop') return { ...step, body: fill(step.body) };
      return step;
    });
  return { ...definition, steps: fill(definition.steps) };
}
const context = (definition: WorkflowDefinition): ValidationContext => ({
  enabled_specialists: WAVE1,
  connections: connectionsFor(definition),
  actions: ACTIONS,
  can_raise_loop_cap: false,
});

describe('workflow templates T1 to T5', () => {
  it('ships exactly the five wave 1 templates, in order', () => {
    expect(WORKFLOW_TEMPLATES.map((t) => t.slug)).toEqual([
      'overdue_invoices',
      'weekly_content_pack',
      'cv_to_interviews',
      'lead_to_proposal',
      'month_end_owner_pack',
    ]);
    expect(releasedTemplates()).toHaveLength(5);
    expect(findWorkflowTemplate('marketplace_stock')).toBeUndefined();
  });

  describe.each(WORKFLOW_TEMPLATES.map((t) => [t.slug, t] as const))('%s', (_slug, template) => {
    it.each(LOCALE_CODES)('validates in %s once its apps are connected', (locale) => {
      const definition = withConnections(template.build(locale));
      const result = validateWorkflowDefinition(definition, context(definition));
      expect(result.issues).toEqual([]);
    });

    it('opens as needs attention when no app is connected, and nothing else is wrong', () => {
      const definition = template.build('en');
      const result = validateWorkflowDefinition(definition, { ...context(definition), connections: [] });
      const needsConnection = flattenSteps(definition.steps).some((s) => s.type === 'connection_action');
      expect(result.issues.every((issue) => issue.needs_attention)).toBe(true);
      expect(result.ok).toBe(!needsConnection);
    });

    it('has the same shape in both languages', () => {
      const shape = (locale: 'en' | 'id') =>
        flattenSteps(template.build(locale).steps).map((s) => `${s.key}:${s.type}`);
      expect(shape('id')).toEqual(shape('en'));
    });

    it('uses only wave 1 specialists and never a pay action', () => {
      const steps = flattenSteps(template.build('en').steps);
      for (const step of steps) {
        if (step.type === 'specialist_task') expect(WAVE1).toContain(step.specialist);
        if (step.type === 'connection_action') {
          expect(ACTIONS[`${step.provider}:${step.action_id}`]?.class).not.toBe('pay');
        }
      }
      for (const slug of template.required_specialists) expect(WAVE1).toContain(slug);
    });

    it('names every app it needs', () => {
      for (const requirement of template.required_connections) {
        expect(PROVIDER_LABELS[requirement.provider]).toBeTruthy();
      }
    });

    it('passes the customer copy lint in both languages', () => {
      for (const locale of LOCALE_CODES) {
        const strings = [template.name[locale], template.summary[locale], template.guardrail[locale]];
        for (const step of flattenSteps(template.build(locale).steps)) {
          strings.push(step.title);
          if ('instruction' in step) strings.push(step.instruction);
        }
        for (const value of strings) {
          expect(lintCopyString(value, { locale, key: `workflow_templates.${template.slug}` })).toEqual([]);
        }
      }
    });

    it('never sends or schedules before a Review step', () => {
      let reviewed = false;
      for (const step of flattenSteps(template.build('en').steps)) {
        if (step.type === 'review') reviewed = true;
        if (step.type === 'connection_action' && ACTIONS[`${step.provider}:${step.action_id}`]!.class !== 'read') {
          expect(reviewed, `${step.key} acts before a Review`).toBe(true);
        }
      }
    });
  });

  it('T1: SinoFinance only drafts, the loop is capped at 25, an empty list ends with a note', () => {
    const steps = flattenSteps(findWorkflowTemplate('overdue_invoices')!.build('en').steps);
    expect(steps.filter((s) => s.type === 'specialist_task' && s.specialist === 'sinofinance').length).toBeGreaterThan(0);
    expect(steps.find((s) => s.type === 'loop' && s.key === 'reminders')).toMatchObject({ cap: 25 });
    expect(steps.find((s) => s.type === 'condition')).toMatchObject({ if_not: 'end', end_note: 'No overdue invoices' });
    const text = JSON.stringify(steps.filter((s) => s.type === 'specialist_task' && s.specialist === 'sinofinance'));
    expect(text).toContain('do not say a payment was received');
  });

  it('T2: scheduling comes only after the review', () => {
    const steps = flattenSteps(findWorkflowTemplate('weekly_content_pack')!.build('en').steps);
    const review = steps.findIndex((s) => s.type === 'review');
    const schedule = steps.findIndex((s) => s.type === 'connection_action');
    expect(review).toBeGreaterThan(-1);
    expect(schedule).toBeGreaterThan(review);
  });

  it('T3: the person decides, SinoPeople never does, and no message goes to "Not now" candidates', () => {
    const steps = flattenSteps(findWorkflowTemplate('cv_to_interviews')!.build('en').steps);
    const ask = steps.find((s) => s.type === 'ask_me');
    expect(ask).toMatchObject({ choices: ['Interview', 'Hold', 'Not now'] });
    const ranking = steps.find((s) => s.key === 'ranking');
    expect(JSON.stringify(ranking)).toContain('Do not recommend hiring or rejecting');
    expect(JSON.stringify(steps.find((s) => s.key === 'invitations'))).toContain('Write nothing for the others');
    expect(JSON.stringify(steps.find((s) => s.key === 'cv_signal'))).toContain('Signal, not a decision');
    expect(steps.findIndex((s) => s.key === 'decision')).toBeLessThan(steps.findIndex((s) => s.key === 'invitations'));
  });

  it('T4: scores are labelled as estimates and a follow-up has its own review', () => {
    const steps = flattenSteps(findWorkflowTemplate('lead_to_proposal')!.build('en').steps);
    expect(JSON.stringify(steps.find((s) => s.key === 'score'))).toContain('\\"Estimate\\"');
    const reviews = steps.filter((s) => s.type === 'review').map((s) => s.key);
    expect(reviews).toEqual(['approval', 'followup_approval']);
    expect(steps.find((s) => s.type === 'wait')).toMatchObject({ duration_hours: 72, or_reply: true });
  });

  it('T5: reads only, aggregates people numbers, and marks estimates', () => {
    const template = findWorkflowTemplate('month_end_owner_pack')!;
    const steps = flattenSteps(template.build('en').steps);
    expect(steps.every((s) => s.type === 'specialist_task')).toBe(true);
    expect(steps.map((s) => s.type === 'specialist_task' && s.specialist)).toEqual([
      'sinofinance',
      'sinosales',
      'sinopeople',
      'sinoinsights',
    ]);
    expect(JSON.stringify(steps.find((s) => s.key === 'people'))).toContain('Do not include any individual name');
    expect(JSON.stringify(steps.find((s) => s.key === 'summary'))).toContain('\\"Estimate\\"');
    expect(template.required_connections).toEqual([]);
  });
});
