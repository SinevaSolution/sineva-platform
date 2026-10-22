export type AccessLevel = 'read' | 'write';

export interface ConnectionGrantEntity {
  connection_id: string;
  agent_slug: string;
  access_level: AccessLevel;
  approval_policy: string;
}

export interface ConnectionGrantRepository {
  listByConnection(workspaceId: string, connectionId: string): Promise<ConnectionGrantEntity[]>;
  /**
   * Replaces the whole set for a connection: slugs not listed lose their grant.
   * Runs inside the caller's transaction scope when there is one.
   */
  replaceAll(
    workspaceId: string,
    connectionId: string,
    grants: Array<{ agent_slug: string; access_level: AccessLevel }>,
    grantedByUserId: string | null,
  ): Promise<void>;
}
