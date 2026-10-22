import { invitationState } from '@/server/domain/members/invitation';
import { InvitationNotFoundError } from '@/server/domain/members/member_errors';
import type { Clock, LinkTokenService, MemberAccountLookup } from '@/server/domain/members/member_ports';
import type { InvitationRepository } from '@/server/domain/repositories/invitation_repository';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import type { InvitationPreviewView } from '@/shared/members_view';
import { firstName } from './member_support';

export interface PreviewInvitationDeps {
  invitations: InvitationRepository;
  accounts: MemberAccountLookup;
  workspaces: Pick<WorkspaceRepository, 'findById'>;
  tokens: LinkTokenService;
  clock: Clock;
}

export class PreviewInvitationUseCase {
  constructor(private readonly deps: PreviewInvitationDeps) {}

  /**
   * What the link holder may know before signing in: the workspace name, the
   * inviter's first name, the role and whether the link still works. Never the
   * invited address (a forwarded link would leak it) and never an id.
   */
  async execute(input: { token: string; viewer_user_id?: string }): Promise<InvitationPreviewView> {
    const d = this.deps;
    const invitation = await d.invitations.findByTokenHash(d.tokens.hash(input.token));
    if (!invitation) {
      throw new InvitationNotFoundError();
    }

    const [workspace, inviter, viewer] = await Promise.all([
      d.workspaces.findById(invitation.workspace_id),
      d.accounts.findById(invitation.inviter_user_id),
      input.viewer_user_id ? d.accounts.findById(input.viewer_user_id) : Promise.resolve(null),
    ]);

    return {
      state: invitationState(invitation, d.clock()),
      workspace_name: workspace?.workspace_name ?? '',
      inviter_first_name: inviter ? firstName(inviter) : null,
      role: invitation.role as InvitationPreviewView['role'],
      expires_at: invitation.expires_at,
      email_matches_session: input.viewer_user_id
        ? viewer !== null && viewer.email.toLowerCase() === invitation.email
        : null,
    };
  }
}
