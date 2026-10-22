import type { WorkspaceMemberEntity, UserRole } from '../entities/user';
import type { DepartmentValue } from '../entities/user_profile';

export interface AddMemberInput {
  user_id: string;
  role: UserRole;
  specialist_scope?: 'all' | 'selected';
  /** The allowlist for scope `selected`; ignored for `all`. */
  specialist_slugs?: string[];
  job_title?: string | null;
  department?: string | null;
}

export interface UpdateOwnMemberAttributesInput {
  job_title?: string | null;
  department?: DepartmentValue | null;
}

/** A member joined with the account facts the members table shows. */
export interface MemberDirectoryEntry {
  member: WorkspaceMemberEntity;
  user: {
    full_name: string;
    preferred_name: string | null;
    email: string;
    phone_number: string | null;
    avatar_url: string | null;
    /** Latest session activity of the person, or null when they never signed in. */
    last_active_at: string | null;
  };
  /** The allowlist; empty unless the scope is `selected`. */
  specialist_slugs: string[];
}

export interface WorkspaceMemberRepository {
  findMembership(workspaceId: string, userId: string): Promise<WorkspaceMemberEntity | null>;
  listMembers(workspaceId: string): Promise<WorkspaceMemberEntity[]>;
  /** Scoped to the workspace: another workspace's member id is simply not found. */
  findById(workspaceId: string, memberId: string): Promise<WorkspaceMemberEntity | null>;
  listDirectory(workspaceId: string): Promise<MemberDirectoryEntry[]>;
  getDirectoryEntry(workspaceId: string, memberId: string): Promise<MemberDirectoryEntry | null>;
  addMember(workspaceId: string, input: AddMemberInput): Promise<WorkspaceMemberEntity>;
  updateRole(workspaceId: string, memberId: string, role: UserRole): Promise<WorkspaceMemberEntity>;
  /** Sets the scope and replaces the allowlist (cleared unless the scope is `selected`). */
  updateAccess(
    workspaceId: string,
    memberId: string,
    access: { specialist_scope: 'all' | 'selected'; specialist_slugs: string[] },
  ): Promise<WorkspaceMemberEntity>;
  removeMember(workspaceId: string, memberId: string): Promise<void>;
  /**
   * Takes a row lock on the workspace for the rest of the transaction, so role
   * changes, removals, leaving and ownership transfers of one workspace run one
   * after another. Only meaningful inside a `TransactionRunner` scope.
   */
  lockWorkspace(workspaceId: string): Promise<void>;
  /**
   * Swaps ownership: `fromUserId` (owner) becomes admin, `toUserId` (admin)
   * becomes owner and `workspaces.owner_user_id` follows. Demotes before it
   * promotes because the one-owner unique index is checked per statement.
   * @returns false, changing nothing, when either side no longer has the
   * expected role.
   */
  swapOwner(workspaceId: string, fromUserId: string, toUserId: string): Promise<boolean>;
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
