import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ENTITLEMENT_KEYS, type EntitlementService } from '@/server/domain/entitlements/entitlements';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { invitationState } from '@/server/domain/members/invitation';
import {
  AlreadyMemberError,
  EmailNotVerifiedError,
  InvitationEmailMismatchError,
  InvitationNotFoundError,
  InvitationStateError,
} from '@/server/domain/members/member_errors';
import type { Clock, LinkTokenService, MemberAccountLookup } from '@/server/domain/members/member_ports';
import type { InvitationRepository } from '@/server/domain/repositories/invitation_repository';
import type { WorkspaceMemberRepository } from '@/server/domain/repositories/workspace_member_repository';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { InvitationAcceptedView } from '@/shared/members_view';

export interface AcceptInvitationDeps {
  members: WorkspaceMemberRepository;
  invitations: InvitationRepository;
  accounts: MemberAccountLookup;
  workspaces: Pick<WorkspaceRepository, 'findById'>;
  tokens: LinkTokenService;
  audit: AuditLogger;
  entitlements: EntitlementService;
  transactions: TransactionRunner;
  clock: Clock;
}

export class AcceptInvitationUseCase {
  constructor(private readonly deps: AcceptInvitationDeps) {}

  async execute(input: { token: string; context: RequestContext }): Promise<InvitationAcceptedView> {
    const d = this.deps;
    const now = d.clock();

    const invitation = await d.invitations.findByTokenHash(d.tokens.hash(input.token));
    if (!invitation) {
      throw new InvitationNotFoundError();
    }

    const state = invitationState(invitation, now);
    if (state === 'expired') {
      // Audited once per invitation (the flag flips on the first notice), and
      // outside any transaction: the refusal below must not roll the row back.
      if (await d.invitations.markExpiredLogged(invitation.id, now)) {
        await d.audit.log({
          action: 'invitation.expired',
          context: input.context,
          workspace_id: invitation.workspace_id,
          target_resource_type: 'invitation',
          target_resource_id: invitation.id,
          metadata: { role: invitation.role },
        });
      }
      throw new InvitationStateError('expired');
    }
    if (state === 'used' || state === 'revoked') {
      throw new InvitationStateError(state);
    }

    // The link is bound to one verified account: a link forwarded over
    // WhatsApp opens for anyone, but only the invited address can use it.
    const account = await d.accounts.findById(input.context.user_id);
    if (!account || account.email.toLowerCase() !== invitation.email) {
      throw new InvitationEmailMismatchError();
    }
    if (!account.email_verified) {
      throw new EmailNotVerifiedError();
    }

    const workspace = await d.workspaces.findById(invitation.workspace_id);
    if (!workspace) {
      throw new NotFoundError('Workspace', invitation.workspace_id);
    }
    if (await d.members.findMembership(invitation.workspace_id, account.id)) {
      throw new AlreadyMemberError();
    }

    const headcount = (await d.members.listMembers(invitation.workspace_id)).length;
    await d.entitlements.assert(invitation.workspace_id, ENTITLEMENT_KEYS.MEMBERS, headcount + 1);

    const member = await d.transactions.run(async () => {
      // Single-use guard: of two concurrent accepts exactly one flips the row.
      if (!(await d.invitations.claimAcceptance(invitation.id, now))) {
        throw new InvitationStateError('used');
      }
      const created = await d.members.addMember(invitation.workspace_id, {
        user_id: account.id,
        role: invitation.role,
        specialist_scope: invitation.specialist_scope,
        specialist_slugs: invitation.specialist_slugs,
      });
      await d.audit.log({
        action: 'invitation.accepted',
        context: input.context,
        workspace_id: invitation.workspace_id,
        target_resource_type: 'workspace_member',
        target_resource_id: created.id,
        metadata: { invitation_id: invitation.id, role: invitation.role },
      });
      return created;
    });

    return {
      workspace: {
        id: workspace.id,
        workspace_slug: workspace.workspace_slug,
        workspace_name: workspace.workspace_name,
      },
      role: member.role,
    };
  }
}
