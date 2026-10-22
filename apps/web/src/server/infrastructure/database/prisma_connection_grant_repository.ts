import 'server-only';
import type {
  AccessLevel,
  ConnectionGrantEntity,
  ConnectionGrantRepository,
} from '@/server/domain/repositories/connection_grant_repository';
import type { PrismaClient } from './generated/client';
import { activeClient } from './prisma_transaction_runner';

export class PrismaConnectionGrantRepository implements ConnectionGrantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByConnection(workspaceId: string, connectionId: string): Promise<ConnectionGrantEntity[]> {
    const rows = await activeClient(this.prisma).connectionGrant.findMany({
      where: { workspace_id: workspaceId, connection_id: connectionId },
      orderBy: { agent_slug: 'asc' },
    });
    return rows.map((row) => ({
      connection_id: row.connection_id,
      agent_slug: row.agent_slug,
      access_level: row.access_level as AccessLevel,
      approval_policy: row.approval_policy,
    }));
  }

  async listForConnections(workspaceId: string, connectionIds: readonly string[]): Promise<ConnectionGrantEntity[]> {
    if (connectionIds.length === 0) return [];
    const rows = await activeClient(this.prisma).connectionGrant.findMany({
      where: { workspace_id: workspaceId, connection_id: { in: [...connectionIds] } },
      orderBy: [{ connection_id: 'asc' }, { agent_slug: 'asc' }],
    });
    return rows.map((row) => ({
      connection_id: row.connection_id,
      agent_slug: row.agent_slug,
      access_level: row.access_level as AccessLevel,
      approval_policy: row.approval_policy,
    }));
  }

  async replaceAll(
    workspaceId: string,
    connectionId: string,
    grants: Array<{ agent_slug: string; access_level: AccessLevel }>,
    grantedByUserId: string | null,
  ): Promise<void> {
    const write = async (db: ReturnType<typeof activeClient>) => {
      await db.connectionGrant.deleteMany({ where: { workspace_id: workspaceId, connection_id: connectionId } });
      if (grants.length > 0) {
        await db.connectionGrant.createMany({
          data: grants.map((grant) => ({
            workspace_id: workspaceId,
            connection_id: connectionId,
            agent_slug: grant.agent_slug,
            access_level: grant.access_level,
            granted_by_user_id: grantedByUserId,
          })),
        });
      }
    };
    const client = activeClient(this.prisma);
    // Inside a transaction scope the caller owns atomicity; outside one, the
    // delete and the insert still have to land together.
    if (client === (this.prisma as unknown)) {
      await this.prisma.$transaction((tx) => write(tx));
    } else {
      await write(client);
    }
  }
}
