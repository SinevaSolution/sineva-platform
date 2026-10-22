import type { RequestContext } from '@/server/domain/context/request_context';
import type { WorkspaceMemberRepository } from '@/server/domain/repositories/workspace_member_repository';
import type { MemberView } from '@/shared/members_view';
import { canViewContact, requireActorRole, requireWorkspaceId, toMemberView } from './member_support';

export class ListMembersUseCase {
  constructor(private readonly deps: { members: WorkspaceMemberRepository }) {}

  /**
   * Everyone sees names and roles. Contact data, scope and last activity are
   * added only for roles that hold `member.view_contact`, and the keys are
   * absent (not null) for the others so a client cannot tell what exists.
   */
  async execute(input: { context: RequestContext }): Promise<MemberView[]> {
    const workspaceId = requireWorkspaceId(input.context);
    const withContact = canViewContact(requireActorRole(input.context));
    const entries = await this.deps.members.listDirectory(workspaceId);
    return entries.map((entry) => toMemberView(entry, input.context.user_id, withContact));
  }
}
