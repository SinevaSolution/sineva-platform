import type { GatewayDeps } from '@/server/domain/toolgateway/gateway_ports';
import { ToolGatewayError } from '@/server/domain/toolgateway/tool_executor';

export class ResolveToolConnectionsUseCase {
  constructor(
    private readonly deps: Pick<
      GatewayDeps,
      'verifier' | 'state' | 'registry' | 'connections' | 'grants'
    >,
  ) {}
  async execute(input: { provider_id: string; run_id: string }, signedContext: string) {
    const claims = await this.deps.verifier.verify(signedContext);
    await this.deps.state.authorize(claims);
    if (claims.run_id !== input.run_id || !this.deps.registry.provider(input.provider_id))
      throw new ToolGatewayError('action_not_allowed');
    if (
      await this.deps.state.isBlocked(claims.tenant_id, input.provider_id, claims.agent_slug, false)
    )
      throw new ToolGatewayError('kill_switch_active');
    const rows = await this.deps.connections.listVisible(claims.tenant_id, claims.user_id, {
      provider_id: input.provider_id,
    });
    const connections = [];
    for (const row of rows) {
      if (
        row.workspace_id !== claims.tenant_id ||
        (row.owner_scope === 'user' && row.owner_user_id !== claims.user_id)
      )
        continue;
      const grant = (await this.deps.grants.listByConnection(claims.tenant_id, row.id)).find(
        (g) => g.agent_slug === claims.agent_slug,
      );
      if (!grant) continue;
      connections.push({
        connection_id: row.id,
        provider_id: row.provider_id,
        status: row.status,
        access_level: grant.access_level,
        granted_scopes: row.granted_scopes,
      });
    }
    return { connections };
  }
}
