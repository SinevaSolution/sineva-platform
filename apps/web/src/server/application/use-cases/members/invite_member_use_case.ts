import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { UserRole } from '@/server/domain/entities/user';
import type { EmailSender } from '@/server/domain/email/email_sender';
import { ENTITLEMENT_KEYS, type EntitlementService } from '@/server/domain/entitlements/entitlements';
import { ForbiddenError } from '@/server/domain/errors/domain_error';
import { INVITATION_TTL_MS } from '@/server/domain/members/invitation';
import { AlreadyMemberError } from '@/server/domain/members/member_errors';
import { canInviteRole } from '@/server/domain/members/member_policy';
import type { Clock, LinkTokenService, MemberAccountLookup } from '@/server/domain/members/member_ports';
import type { InvitationRepository } from '@/server/domain/repositories/invitation_repository';
import type { WorkspaceMemberRepository } from '@/server/domain/repositories/workspace_member_repository';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { InvitationView } from '@/shared/members_view';
import {
  inviteUrl,
  requireActorRole,
  requireWorkspaceId,
  resolveAccess,
  sendInvitationEmail,
  toInvitationView,
} from './member_support';

export interface InviteMemberDeps {
  members: WorkspaceMemberRepository;
  invitations: InvitationRepository;
  accounts: MemberAccountLookup;
  workspaces: Pick<WorkspaceRepository, 'findById'>;
  tokens: LinkTokenService;
  email: EmailSender;
  audit: AuditLogger;
  entitlements: EntitlementService;
  transactions: TransactionRunner;
  clock: Clock;
  appUrl: string;
  knownSpecialistSlugs: readonly string[];
}

export interface InviteMemberInput {
  context: RequestContext;
  email: string;
  role: UserRole;
  specialist_scope?: 'all' | 'selected';
  specialist_slugs?: string[];
}

export interface InviteMemberResult {
  invitation: InvitationView;
  invite_url: string;
  replaced: boolean;
  email_sent: boolean;
}

export class InviteMemberUseCase {
  constructor(private readonly deps: InviteMemberDeps) {}

  async execute(input: InviteMemberInput): Promise<InviteMemberResult> {
    const d = this.deps;
    const workspaceId = requireWorkspaceId(input.context);
    const actorRole = requireActorRole(input.context);
    const email = input.email.trim().toLowerCase();

    if (!canInviteRole(actorRole, input.role)) {
      throw new ForbiddenError(`A ${actorRole} cannot invite someone as ${input.role}`);
    }
    const access = resolveAccess(input.role, input.specialist_scope, input.specialist_slugs, d.knownSpecialistSlugs);

    const existingAccount = await d.accounts.findByEmail(email);
    if (existingAccount && (await d.members.findMembership(workspaceId, existingAccount.id))) {
      throw new AlreadyMemberError();
    }

    // The seat check runs before any write so a refusal leaves nothing behind.
    // The quantity is the headcount the workspace would have after this person joins.
    const headcount = (await d.members.listMembers(workspaceId)).length;
    await d.entitlements.assert(workspaceId, ENTITLEMENT_KEYS.MEMBERS, headcount + 1);

    const { token, hash } = d.tokens.generate();
    const now = d.clock();
    const { invitation, replaced } = await d.transactions.run(async () => {
      const result = await d.invitations.upsertPending(workspaceId, {
        email,
        role: input.role,
        inviter_user_id: input.context.user_id,
        specialist_scope: access.specialist_scope,
        specialist_slugs: access.specialist_slugs,
        token_hash: hash,
        expires_at: new Date(now.getTime() + INVITATION_TTL_MS),
        sent_at: now,
      });
      await d.audit.log({
        action: 'member.invited',
        context: input.context,
        workspace_id: workspaceId,
        target_resource_type: 'invitation',
        target_resource_id: result.invitation.id,
        // No address: the invitation id is enough to find it, and the audit log keeps no personal data.
        metadata: {
          role: input.role,
          replaced: result.replaced,
          specialist_scope: access.specialist_scope,
          specialist_count: access.specialist_slugs.length,
        },
      });
      return result;
    });

    const email_sent = await sendInvitationEmail(d, invitation, token);
    return {
      invitation: toInvitationView(invitation, 'pending'),
      invite_url: inviteUrl(d.appUrl, token),
      replaced,
      email_sent,
    };
  }
}
