import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ForbiddenError, NotFoundError } from '@/server/domain/errors/domain_error';
import { canInviteRole } from '@/server/domain/members/member_policy';
import type { Clock } from '@/server/domain/members/member_ports';
import type { InvitationRepository } from '@/server/domain/repositories/invitation_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import { requireActorRole, requireWorkspaceId } from './member_support';

export interface RevokeInvitationDeps {
  invitations: InvitationRepository;
  audit: AuditLogger;
  transactions: TransactionRunner;
  clock: Clock;
}

export class RevokeInvitationUseCase {
  constructor(private readonly deps: RevokeInvitationDeps) {}

  async execute(input: { context: RequestContext; invitation_id: string }): Promise<void> {
    const d = this.deps;
    const workspaceId = requireWorkspaceId(input.context);
    const actorRole = requireActorRole(input.context);

    const existing = await d.invitations.findById(workspaceId, input.invitation_id);
    if (!existing || existing.accepted_at || existing.revoked_at) {
      throw new NotFoundError('Invitation', input.invitation_id);
    }
    // Same ceiling as sending: an admin cannot cancel what only the owner may send.
    if (!canInviteRole(actorRole, existing.role)) {
      throw new ForbiddenError(`A ${actorRole} cannot manage an invitation for ${existing.role}`);
    }

    await d.transactions.run(async () => {
      if (!(await d.invitations.revoke(workspaceId, existing.id, d.clock()))) {
        // Accepted or revoked between the read and the write.
        throw new NotFoundError('Invitation', input.invitation_id);
      }
      await d.audit.log({
        action: 'invitation.revoked',
        context: input.context,
        workspace_id: workspaceId,
        target_resource_type: 'invitation',
        target_resource_id: existing.id,
        metadata: { role: existing.role },
      });
    });
  }
}
