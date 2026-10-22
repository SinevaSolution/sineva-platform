import type { RequestContext } from '@/server/domain/context/request_context';
import { UpstreamServiceError } from '@/server/domain/errors/domain_error';
import { hasPermission } from '@/server/domain/permissions/registry';
import type { AiEngineGateway } from '@/server/domain/repositories/ai_engine_gateway';
import type { AgentCatalog, AgentCategory } from '@/server/domain/specialists/agent_catalog';
import type {
  SpecialistAccess,
  WorkspaceSpecialist,
  WorkspaceSpecialistRoster,
} from '@/server/domain/specialists/workspace_specialist';
import type { SpecialistManifestEntry } from '@/shared/specialists/manifest';

type MergedSpecialist = Omit<WorkspaceSpecialist, 'my_access'>;

/**
 * The workspace roster (FR-SPEC-05, 08, 13): sineva-ai's catalog merged with the
 * presentation manifest. The catalog is fetched on every call and any failure
 * (503 unreachable, 502 bad answer) propagates, because answering from the
 * manifest or from the last good catalog would be an invented roster (ADR-0024).
 */
export class ListWorkspaceSpecialistsUseCase {
  // One slot: the merge depends only on the catalog, so it is reused while
  // `catalog_version` is unchanged. A failed call never reads it. Per-member
  // access is recomputed on every call and is not part of it.
  private merged: { version: string; items: MergedSpecialist[] } | null = null;

  constructor(
    private readonly gateway: AiEngineGateway,
    private readonly manifest: readonly SpecialistManifestEntry[],
  ) {}

  async execute(
    query: { category_filter?: AgentCategory },
    context: RequestContext,
  ): Promise<WorkspaceSpecialistRoster> {
    const catalog = await this.gateway.listAgents({ requestId: context.request_id });
    const base = this.mergeOnce(catalog);

    const items = base
      .filter((item) => !query.category_filter || item.category === query.category_filter)
      .map((item) => ({ ...item, my_access: accessFor(item.agent_slug, context) }));

    return { catalog_version: catalog.catalog_version, items };
  }

  private mergeOnce(catalog: AgentCatalog): MergedSpecialist[] {
    if (this.merged?.version === catalog.catalog_version) {
      return this.merged.items;
    }

    const bySlug = new Map(catalog.agents.map((agent) => [agent.agent_slug, agent]));
    const items = [...this.manifest]
      .sort((a, b) => a.order - b.order)
      .map((entry): MergedSpecialist => {
        const agent = bySlug.get(entry.agent_slug);
        // The platform will not present a specialist sineva-ai does not know.
        // Catalog entries with no manifest entry (the orchestrator, wave 2 and 3
        // coming soon) are the opposite case and are skipped: there is no copy
        // to show for them yet.
        if (!agent) {
          throw new UpstreamServiceError(
            'The specialist catalog is out of step with this app',
            'catalog_drift',
          );
        }
        return {
          agent_slug: entry.agent_slug,
          handle: agent.handle,
          display_name: entry.display_name,
          category: agent.category,
          wave: agent.wave,
          status: agent.status,
          // M0: no `workspace_specialists` table yet, so the wave 1 specialists
          // sineva-ai reports live are on.
          enabled: agent.wave === 1 && agent.status === 'live',
          accent_key: entry.accent_key,
          room_theme_id: entry.room_theme_id,
          order: entry.order,
          copy: entry.copy,
        };
      });

    this.merged = { version: catalog.catalog_version, items };
    return items;
  }
}

// `specialist.use` is `yes` for the role in the matrix, so the policy hook in
// the permission registry never runs for it; the per-specialist scope is
// checked here, as `with_auth` does for the routes that act on one specialist.
function accessFor(slug: string, context: RequestContext): SpecialistAccess {
  const role = context.role;
  if (!role || !hasPermission(role, 'specialist.use').allowed) {
    return 'unavailable';
  }
  if (context.specialist_scope === 'selected') {
    return context.allowed_specialists?.includes(slug) ? 'available' : 'unavailable';
  }
  return 'available';
}
