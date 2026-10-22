import 'server-only';
import type { McpGrantRevoker } from '@/server/domain/members/member_ports';

// Deliberate no-op. The MCP server, its OAuth grants and access tokens arrive
// in M3, so there is nothing to revoke yet. The member use cases already call
// this port on every removal, leave and role change that drops `mcp.use`;
// the real revoker replaces this class in the container and no caller changes.
// It is not a silent fallback for a failure: it is the documented absence of
// the feature it hooks into.
export class NoopMcpGrantRevoker implements McpGrantRevoker {
  async revokeForMember(): Promise<void> {
    return;
  }
}
