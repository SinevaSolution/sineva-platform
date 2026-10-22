import { loadFacts, type WorkflowDeps } from '@/server/application/workflows/workflow_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { WorkflowCatalogView } from '@/shared/workflows/workflow_view';

export class GetWorkflowCatalogUseCase {
  constructor(private readonly deps: WorkflowDeps) {}

  /** What the builder's pickers offer: specialists that are on, apps that are connected, their actions. */
  async execute(context: RequestContext): Promise<WorkflowCatalogView> {
    const facts = await loadFacts(this.deps, context, { strict: false });
    return {
      enabled_specialists: facts.context.enabled_specialists ? [...facts.context.enabled_specialists] : null,
      connections: (facts.context.connections ?? []).map((connection) => ({
        id: connection.id,
        provider: connection.provider,
        label: connection.provider,
        connected: connection.connected,
      })),
      actions: Object.entries(facts.context.actions ?? {}).map(([id, meta]) => {
        const [provider = '', actionId = ''] = id.split(':');
        return { provider, action_id: actionId, class: meta.class };
      }),
    };
  }
}
