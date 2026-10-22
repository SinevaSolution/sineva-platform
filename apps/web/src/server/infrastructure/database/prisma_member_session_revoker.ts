import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type { MemberSessionRevoker } from '@/server/domain/members/member_ports';
import { activeClient } from './prisma_transaction_runner';

export class PrismaMemberSessionRevoker implements MemberSessionRevoker {
  constructor(private readonly prisma: PrismaClient) {}

  // A session is user-wide, not workspace-wide: the membership row is the live
  // access gate (every request resolves memberships from the database), so
  // deleting it already cuts the person off. This revokes the sessions that
  // are pinned to the workspace through `active_workspace_id`, so none of them
  // keeps pointing at a workspace the person has left.
  async revokeForWorkspace(userId: string, workspaceId: string): Promise<number> {
    const result = await activeClient(this.prisma).session.updateMany({
      where: { user_id: userId, active_workspace_id: workspaceId, revoked_at: null },
      data: { revoked_at: new Date(), updated_at: new Date() },
    });
    return result.count;
  }
}
