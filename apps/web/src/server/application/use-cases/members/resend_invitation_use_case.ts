import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { EmailSender } from '@/server/domain/email/email_sender';
import { ForbiddenError, NotFoundError } from '@/server/domain/errors/domain_error';
import { INVITATION_TTL_MS } from '@/server/domain/members/invitation';
import { canInviteRole } from '@/server/domain/members/member_policy';
import type { Clock, LinkTokenService, MemberAccountLookup } from '@/server/domain/members/member_ports';
import type { InvitationRepository } from '@/server/domain/repositories/invitation_repository';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { InviteMemberResult } from './invite_member_use_case';
import {
  inviteUrl,
  requireActorRole,
  requireWorkspaceId,
  sendInvitationEmail,
  toInvitationView,
} from './member_support';

export interface ResendInvitationDeps {
  invitations: InvitationRepository;
  accounts: MemberAccountLookup;
  workspaces: Pick<WorkspaceRepository, 'findById'>;
  tokens: LinkTokenService;
  email: EmailSender;
  audit: AuditLogger;
  transactions: TransactionRunner;
  clock: Clock;
  appUrl: string;
}

export class ResendInvitationUseCase {
  constructor(private readonly deps: ResendInvitationDeps) {}

  /**
   * New token and a fresh 7 days. The old link stops working at once, which is
   * also the answer to "I sent it to the wrong WhatsApp chat".
   */
  async execute(input: { context: RequestContext; invitation_id: string }): Promise<InviteMemberResult> {
    const d = this.deps;
    const workspaceId = requireWorkspaceId(input.context);
    const actorRole = requireActorRole(input.context);

    const existing = await d.invitations.findById(workspaceId, input.invitation_id);
    if (!existing || existing.accepted_at || existing.revoked_at) {
      throw new NotFoundError('Invitation', input.invitation_id);
    }
    if (!canInviteRole(actorRole, existing.role)) {
      throw new ForbiddenError(`A ${actorRole} cannot manage an invitation for ${existing.role}`);
    }

    const { token, hash } = d.tokens.generate();
    const now = d.clock();
    const invitation = await d.transactions.run(async () => {
      const updated = await d.invitations.replaceToken(
        workspaceId,
        existing.id,
        hash,
        new Date(now.getTime() + INVITATION_TTL_MS),
        now,
      );
      await d.audit.log({
        action: 'member.invited',
        context: input.context,
        workspace_id: workspaceId,
        target_resource_type: 'invitation',
        target_resource_id: updated.id,
        metadata: { role: updated.role, replaced: true, resend: true },
      });
      return updated;
    });

    const email_sent = await sendInvitationEmail(d, invitation, token);
    return {
      invitation: toInvitationView(invitation, 'pending'),
      invite_url: inviteUrl(d.appUrl, token),
      replaced: true,
      email_sent,
    };
  }
}
