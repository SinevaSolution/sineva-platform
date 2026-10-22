import 'server-only';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { AiEngineGateway } from '@/server/domain/repositories/ai_engine_gateway';
import type { WorkflowCatalog, WorkflowConnection } from '@/server/domain/workflows/workflow_ports';
import type { ActionMeta } from '@/shared/workflows/validate';

/**
 * What the Workflow validator is told about this workspace.
 *
 * Specialists come from sineva-ai's catalog with the same M0 derivation the
 * roster route uses (a wave 1 specialist that is live is on); an unreachable
 * sineva-ai propagates as a 503 and the use case decides whether that blocks.
 *
 * Connections and actions: the connector registry and the Tool Gateway (M2)
 * are not on this base, so there is nothing to list. Reporting an empty list is
 * the truth; a made-up Jurnal or WhatsApp would let a person pick a step that
 * can never run. When the registry lands, this adapter reads it and nothing
 * else changes.
 */
export class RosterWorkflowCatalog implements WorkflowCatalog {
  constructor(private readonly gateway: AiEngineGateway) {}

  async enabledSpecialists(context: RequestContext): Promise<string[] | null> {
    const catalog = await this.gateway.listAgents({ requestId: context.request_id });
    return catalog.agents.filter((agent) => agent.wave === 1 && agent.status === 'live').map((agent) => agent.agent_slug);
  }

  async connections(): Promise<WorkflowConnection[]> {
    return [];
  }

  async actions(): Promise<Record<string, ActionMeta>> {
    return {};
  }
}
