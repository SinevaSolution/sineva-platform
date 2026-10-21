import type { WorkspaceMemberEntity, UserRole } from '../entities/user';

export interface AddMemberInput {
  user_id: string;
  role: UserRole;
  specialist_scope?: 'all' | 'selected';
  job_title?: string | null;
  department?: string | null;
}

export interface WorkspaceMemberRepository {
  findMembership(workspaceId: string, userId: string): Promise<WorkspaceMemberEntity | null>;
  listMembers(workspaceId: string): Promise<WorkspaceMemberEntity[]>;
  addMember(workspaceId: string, input: AddMemberInput): Promise<WorkspaceMemberEntity>;
  updateRole(workspaceId: string, memberId: string, role: UserRole): Promise<WorkspaceMemberEntity>;
  removeMember(workspaceId: string, memberId: string): Promise<void>;
}
