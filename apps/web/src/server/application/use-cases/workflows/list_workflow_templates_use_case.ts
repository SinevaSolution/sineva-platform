import { loadFacts, type WorkflowDeps } from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { flattenSteps } from '@/shared/workflows/definition';
import { PROVIDER_LABELS, releasedTemplates } from '@/shared/workflows/templates';
import type { WorkflowTemplateView } from '@/shared/workflows/workflow_view';

export class ListWorkflowTemplatesUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  /** Released templates only: later waves are hidden, not shown disabled. */
  async execute(locale: 'en' | 'id', context: RequestContext): Promise<WorkflowTemplateView[]> {
    const facts = await loadFacts(this.deps, context, { strict: false });
    const enabled = facts.context.enabled_specialists;
    const connected = new Set((facts.context.connections ?? []).filter((c) => c.connected).map((c) => c.provider));
    return releasedTemplates().map((template) => {
      const steps = flattenSteps(template.build(locale).steps);
      return {
        slug: template.slug,
        name: template.name[locale],
        summary: template.summary[locale],
        guardrail: template.guardrail[locale],
        specialists: [...template.required_specialists],
        // Unknown (sineva-ai unreachable) is reported as nothing missing, never as everything missing.
        missing_specialists: enabled ? template.required_specialists.filter((slug) => !enabled.includes(slug)) : [],
        requirements: template.required_connections.map((requirement) => ({
          provider: requirement.provider,
          label: PROVIDER_LABELS[requirement.provider] ?? requirement.provider,
          optional: requirement.optional,
          connected: connected.has(requirement.provider),
        })),
        step_count: steps.length,
        review_count: steps.filter((step) => step.type === 'review').length,
      };
    });
  }
}
