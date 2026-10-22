import type {
  AccessLevel,
  ConnectionGrantEntity,
  ConnectionGrantRepository,
} from '@/server/domain/repositories/connection_grant_repository';

export class InMemoryConnectionGrantRepository implements ConnectionGrantRepository {
  readonly rows: Array<ConnectionGrantEntity & { workspace_id: string; granted_by_user_id: string | null }> = [];

  async listByConnection(workspaceId: string, connectionId: string): Promise<ConnectionGrantEntity[]> {
    return this.rows
      .filter((row) => row.workspace_id === workspaceId && row.connection_id === connectionId)
      .map(({ connection_id, agent_slug, access_level, approval_policy }) => ({
        connection_id,
        agent_slug,
        access_level,
        approval_policy,
      }));
  }

  async replaceAll(
    workspaceId: string,
    connectionId: string,
    grants: Array<{ agent_slug: string; access_level: AccessLevel }>,
    grantedByUserId: string | null,
  ): Promise<void> {
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      const row = this.rows[i]!;
      if (row.workspace_id === workspaceId && row.connection_id === connectionId) this.rows.splice(i, 1);
    }
    for (const grant of grants) {
      this.rows.push({
        workspace_id: workspaceId,
        connection_id: connectionId,
        agent_slug: grant.agent_slug,
        access_level: grant.access_level,
        approval_policy: 'ask_every_time',
        granted_by_user_id: grantedByUserId,
      });
    }
  }
}
