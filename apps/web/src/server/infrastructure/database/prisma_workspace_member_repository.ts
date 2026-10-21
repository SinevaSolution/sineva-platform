import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type {
  AddMemberInput,
  WorkspaceMemberRepository,
} from '@/server/domain/repositories/workspace_member_repository';
import type { WorkspaceMemberEntity, UserRole } from '@/server/domain/entities/user';
import { validateWorkspaceId } from '@/server/domain/tenancy/tenant_isolation';

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

export class PrismaWorkspaceMemberRepository implements WorkspaceMemberRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMemberEntity | null> {
    validateWorkspaceId(workspaceId);
    const row = await this.prisma.workspaceMember.findUnique({
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
    const rows = await this.prisma.workspaceMember.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { created_at: 'asc' },
    });
    return rows.map(mapMember);
  }

  async addMember(
    workspaceId: string,
    input: AddMemberInput,
  ): Promise<WorkspaceMemberEntity> {
    validateWorkspaceId(workspaceId);
    const row = await this.prisma.workspaceMember.create({
      data: {
        workspace_id: workspaceId,
        user_id: input.user_id,
        role: input.role,
        specialist_scope: input.specialist_scope ?? 'all',
        job_title: input.job_title ?? null,
        department: input.department ?? null,
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
    const row = await this.prisma.workspaceMember.update({
      where: {
        id: memberId,
        workspace_id: workspaceId,
      },
      data: { role },
    });
    return mapMember(row);
  }

  async removeMember(workspaceId: string, memberId: string): Promise<void> {
    validateWorkspaceId(workspaceId);
    await this.prisma.workspaceMember.delete({
      where: {
        id: memberId,
        workspace_id: workspaceId,
      },
    });
  }
}
