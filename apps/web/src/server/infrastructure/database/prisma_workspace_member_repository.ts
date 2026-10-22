import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type {
  AddMemberInput,
  MemberDirectoryEntry,
  UpdateOwnMemberAttributesInput,
  WorkspaceMemberRepository,
} from '@/server/domain/repositories/workspace_member_repository';
import type { WorkspaceMemberEntity, UserRole } from '@/server/domain/entities/user';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { avatarUrlForKey } from '@/server/domain/profile/avatar';
import { validateWorkspaceId } from '@/server/domain/tenancy/tenant_isolation';
import { activeClient } from './prisma_transaction_runner';

function mapMember(row: {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  specialist_scope: string;
  job_title: string | null;
  department: string | null;
  created_at: Date;
  updated_at: Date;
}): WorkspaceMemberEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    role: row.role as UserRole,
    specialist_scope: row.specialist_scope as 'all' | 'selected',
    job_title: row.job_title,
    department: row.department,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

const NOT_FOUND = 'P2025';

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === NOT_FOUND;
}

// Every method reads its client through `activeClient` so a use case can make
// a membership change, the session revocation and the audit row one
// transaction; a method that used `this.prisma` would silently write outside it.
export class PrismaWorkspaceMemberRepository implements WorkspaceMemberRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return activeClient(this.prisma);
  }

  async findMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMemberEntity | null> {
    validateWorkspaceId(workspaceId);
    const row = await this.db.workspaceMember.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: workspaceId,
          user_id: userId,
        },
      },
    });
    return row ? mapMember(row) : null;
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMemberEntity[]> {
    validateWorkspaceId(workspaceId);
    const rows = await this.db.workspaceMember.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { created_at: 'asc' },
    });
    return rows.map(mapMember);
  }

  async findById(workspaceId: string, memberId: string): Promise<WorkspaceMemberEntity | null> {
    validateWorkspaceId(workspaceId);
    // Filtering on the workspace in the same query is what makes another
    // workspace's member id a plain "not found" instead of a leak.
    const row = await this.db.workspaceMember.findFirst({
      where: { id: memberId, workspace_id: workspaceId },
    });
    return row ? mapMember(row) : null;
  }

  async listDirectory(workspaceId: string): Promise<MemberDirectoryEntry[]> {
    validateWorkspaceId(workspaceId);
    const rows = await this.db.workspaceMember.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { created_at: 'asc' },
      include: { user: true, specialists: true },
    });
    const lastActive = await this.lastActiveByUser(rows.map((row) => row.user_id));
    return rows.map((row) => this.toEntry(row, lastActive.get(row.user_id) ?? null));
  }

  async getDirectoryEntry(workspaceId: string, memberId: string): Promise<MemberDirectoryEntry | null> {
    validateWorkspaceId(workspaceId);
    const row = await this.db.workspaceMember.findFirst({
      where: { id: memberId, workspace_id: workspaceId },
      include: { user: true, specialists: true },
    });
    if (!row) {
      return null;
    }
    const lastActive = await this.lastActiveByUser([row.user_id]);
    return this.toEntry(row, lastActive.get(row.user_id) ?? null);
  }

  async addMember(
    workspaceId: string,
    input: AddMemberInput,
  ): Promise<WorkspaceMemberEntity> {
    validateWorkspaceId(workspaceId);
    const scope = input.specialist_scope ?? 'all';
    const row = await this.db.workspaceMember.create({
      data: {
        workspace_id: workspaceId,
        user_id: input.user_id,
        role: input.role,
        specialist_scope: scope,
        job_title: input.job_title ?? null,
        department: input.department ?? null,
        ...(scope === 'selected' && input.specialist_slugs?.length
          ? {
              specialists: {
                create: input.specialist_slugs.map((agent_slug) => ({
                  workspace_id: workspaceId,
                  agent_slug,
                })),
              },
            }
          : {}),
      },
    });
    return mapMember(row);
  }

  async updateRole(
    workspaceId: string,
    memberId: string,
    role: UserRole,
  ): Promise<WorkspaceMemberEntity> {
    validateWorkspaceId(workspaceId);
    try {
      const row = await this.db.workspaceMember.update({
        where: {
          id: memberId,
          workspace_id: workspaceId,
        },
        // `updated_at` does not refresh itself on a raw update path (prisma/AGENTS.md).
        data: { role, updated_at: new Date() },
      });
      return mapMember(row);
    } catch (err) {
      if (isNotFound(err)) {
        throw new NotFoundError('Workspace member', memberId);
      }
      throw err;
    }
  }

  async updateAccess(
    workspaceId: string,
    memberId: string,
    access: { specialist_scope: 'all' | 'selected'; specialist_slugs: string[] },
  ): Promise<WorkspaceMemberEntity> {
    validateWorkspaceId(workspaceId);
    const db = this.db;
    const existing = await db.workspaceMember.findFirst({
      where: { id: memberId, workspace_id: workspaceId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundError('Workspace member', memberId);
    }
    // Replace, never merge: the allowlist is the exact set the caller sent.
    await db.workspaceMemberSpecialist.deleteMany({ where: { workspace_member_id: memberId } });
    if (access.specialist_scope === 'selected' && access.specialist_slugs.length > 0) {
      await db.workspaceMemberSpecialist.createMany({
        data: access.specialist_slugs.map((agent_slug) => ({
          workspace_id: workspaceId,
          workspace_member_id: memberId,
          agent_slug,
        })),
      });
    }
    const row = await db.workspaceMember.update({
      where: { id: memberId },
      data: { specialist_scope: access.specialist_scope, updated_at: new Date() },
    });
    return mapMember(row);
  }

  async updateOwnAttributes(
    workspaceId: string,
    userId: string,
    input: UpdateOwnMemberAttributesInput,
  ): Promise<WorkspaceMemberEntity> {
    validateWorkspaceId(workspaceId);
    try {
      const row = await this.db.workspaceMember.update({
        where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } },
        data: { job_title: input.job_title, department: input.department },
      });
      return mapMember(row);
    } catch (err) {
      // P2025: no membership row for this (workspace, user).
      if (isNotFound(err)) {
        throw new NotFoundError('Workspace member', userId);
      }
      throw err;
    }
  }

  async removeMember(workspaceId: string, memberId: string): Promise<void> {
    validateWorkspaceId(workspaceId);
    // The allowlist rows go with the member through the cascade on the relation.
    const result = await this.db.workspaceMember.deleteMany({
      where: { id: memberId, workspace_id: workspaceId },
    });
    if (result.count === 0) {
      throw new NotFoundError('Workspace member', memberId);
    }
  }

  async lockWorkspace(workspaceId: string): Promise<void> {
    validateWorkspaceId(workspaceId);
    // A row lock held until the surrounding transaction ends. The workspace
    // row is the natural mutex: every membership change of one workspace takes
    // it first, so two of them queue instead of racing (two admins demoting
    // each other, a removal during an ownership transfer).
    const rows = await this.db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM platform.workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new NotFoundError('Workspace', workspaceId);
    }
  }

  async swapOwner(workspaceId: string, fromUserId: string, toUserId: string): Promise<boolean> {
    validateWorkspaceId(workspaceId);
    const db = this.db;
    // Check the target before touching the owner, so a stale request returns
    // false having written nothing even without a surrounding transaction.
    const target = await db.workspaceMember.findFirst({
      where: { workspace_id: workspaceId, user_id: toUserId, role: 'admin' },
      select: { id: true },
    });
    if (!target) {
      return false;
    }
    // Each update is conditional on the role the request was made against, so
    // a stale transfer changes nothing. Demote first: the one-owner unique
    // index is checked per statement and cannot be deferred.
    const demoted = await db.workspaceMember.updateMany({
      where: { workspace_id: workspaceId, user_id: fromUserId, role: 'owner' },
      data: { role: 'admin', updated_at: new Date() },
    });
    if (demoted.count !== 1) {
      return false;
    }
    const promoted = await db.workspaceMember.updateMany({
      where: { workspace_id: workspaceId, user_id: toUserId, role: 'admin' },
      data: { role: 'owner', updated_at: new Date() },
    });
    if (promoted.count !== 1) {
      // Inside a transaction the throw rolls the demotion back; outside one the
      // caller is wrong, so fail loudly instead of leaving a workspace without an owner.
      throw new Error('ownership swap lost its target mid-transaction');
    }
    await db.workspace.update({
      where: { id: workspaceId },
      data: { owner_user_id: toUserId, updated_at: new Date() },
    });
    return true;
  }

  // Latest sign-in per person. `sessions` has no "last used" column, so this
  // is the newest session start, not the last request.
  private async lastActiveByUser(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) {
      return new Map();
    }
    const groups = await this.db.session.groupBy({
      by: ['user_id'],
      where: { user_id: { in: userIds } },
      _max: { created_at: true },
    });
    const result = new Map<string, string>();
    for (const group of groups) {
      if (group._max.created_at) {
        result.set(group.user_id, group._max.created_at.toISOString());
      }
    }
    return result;
  }

  private toEntry(
    row: Parameters<typeof mapMember>[0] & {
      user: {
        full_name: string;
        preferred_name: string | null;
        email: string;
        phone_number: string | null;
        avatar_url: string | null;
      };
      specialists: Array<{ agent_slug: string }>;
    },
    lastActiveAt: string | null,
  ): MemberDirectoryEntry {
    return {
      member: mapMember(row),
      user: {
        full_name: row.user.full_name,
        preferred_name: row.user.preferred_name,
        email: row.user.email,
        phone_number: row.user.phone_number,
        avatar_url: avatarUrlForKey(row.user.avatar_url),
        last_active_at: lastActiveAt,
      },
      specialist_slugs:
        row.specialist_scope === 'selected' ? row.specialists.map((s) => s.agent_slug).sort() : [],
    };
  }
}
