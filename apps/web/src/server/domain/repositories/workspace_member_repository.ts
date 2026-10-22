import type { WorkspaceMemberEntity, UserRole } from '../entities/user';
import type { DepartmentValue } from '../entities/user_profile';

export interface AddMemberInput {
  user_id: string;
  role: UserRole;
  specialist_scope?: 'all' | 'selected';
  job_title?: string | null;
  department?: string | null;
}

export interface UpdateOwnMemberAttributesInput {
  job_title?: string | null;
  department?: DepartmentValue | null;
}

export interface WorkspaceMemberRepository {
  findMembership(workspaceId: string, userId: string): Promise<WorkspaceMemberEntity | null>;
  listMembers(workspaceId: string): Promise<WorkspaceMemberEntity[]>;
  addMember(workspaceId: string, input: AddMemberInput): Promise<WorkspaceMemberEntity>;
  updateRole(workspaceId: string, memberId: string, role: UserRole): Promise<WorkspaceMemberEntity>;
  removeMember(workspaceId: string, memberId: string): Promise<void>;
  /**
   * Edits job title and department of the caller's own membership. Keyed on
   * (workspace, user) so it cannot reach another member's row.
   * @throws NotFoundError when the user is not a member of the workspace.
   */
  updateOwnAttributes(
    workspaceId: string,
    userId: string,
    input: UpdateOwnMemberAttributesInput,
  ): Promise<WorkspaceMemberEntity>;
}
