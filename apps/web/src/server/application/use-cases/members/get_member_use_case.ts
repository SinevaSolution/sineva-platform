import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { WorkspaceMemberRepository } from '@/server/domain/repositories/workspace_member_repository';
import type { MemberView } from '@/shared/members_view';
import { canViewContact, requireActorRole, requireWorkspaceId, toMemberView } from './member_support';

export class GetMemberUseCase {
  constructor(private readonly deps: { members: WorkspaceMemberRepository }) {}

  async execute(input: { context: RequestContext; member_id: string }): Promise<MemberView> {
    const workspaceId = requireWorkspaceId(input.context);
    const entry = await this.deps.members.getDirectoryEntry(workspaceId, input.member_id);
    if (!entry) {
      throw new NotFoundError('Workspace member', input.member_id);
    }
    return toMemberView(entry, input.context.user_id, canViewContact(requireActorRole(input.context)));
  }
}
