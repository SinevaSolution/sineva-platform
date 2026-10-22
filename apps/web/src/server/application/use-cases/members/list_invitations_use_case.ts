import type { RequestContext } from '@/server/domain/context/request_context';
import { invitationState } from '@/server/domain/members/invitation';
import type { Clock } from '@/server/domain/members/member_ports';
import type { InvitationRepository } from '@/server/domain/repositories/invitation_repository';
import type { InvitationView } from '@/shared/members_view';
import { requireWorkspaceId, toInvitationView } from './member_support';

export class ListInvitationsUseCase {
  constructor(private readonly deps: { invitations: InvitationRepository; clock: Clock }) {}

  /** Open invitations; lapsed ones stay listed (state `expired`) so they can be resent. */
  async execute(input: { context: RequestContext }): Promise<InvitationView[]> {
    const workspaceId = requireWorkspaceId(input.context);
    const now = this.deps.clock();
    const open = await this.deps.invitations.listOpen(workspaceId);
    return open.map((invitation) =>
      toInvitationView(invitation, invitationState(invitation, now) === 'expired' ? 'expired' : 'pending'),
    );
  }
}
