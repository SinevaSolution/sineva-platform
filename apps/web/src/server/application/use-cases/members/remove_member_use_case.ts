import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ForbiddenError, NotFoundError } from '@/server/domain/errors/domain_error';
import { LastOwnerError } from '@/server/domain/members/member_errors';
import { canRemoveMember } from '@/server/domain/members/member_policy';
import type { McpGrantRevoker, MemberSessionRevoker } from '@/server/domain/members/member_ports';
import type { WorkspaceMemberRepository } from '@/server/domain/repositories/workspace_member_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import { requireWorkspaceId } from './member_support';

export interface RemoveMemberDeps {
  members: WorkspaceMemberRepository;
  audit: AuditLogger;
  transactions: TransactionRunner;
  sessions: MemberSessionRevoker;
  mcp: McpGrantRevoker;
}

export class RemoveMemberUseCase {
  constructor(private readonly deps: RemoveMemberDeps) {}

  async execute(input: { context: RequestContext; member_id: string }): Promise<void> {
    const d = this.deps;
    const workspaceId = requireWorkspaceId(input.context);
    let removedUserId = '';

    await d.transactions.run(async () => {
      await d.members.lockWorkspace(workspaceId);
      const actor = await d.members.findMembership(workspaceId, input.context.user_id);
      if (!actor) {
        throw new ForbiddenError('Membership is required for this action');
      }
      const target = await d.members.findById(workspaceId, input.member_id);
      if (!target) {
        throw new NotFoundError('Workspace member', input.member_id);
      }
      if (target.role === 'owner') {
        // The workspace always has exactly one owner. The owner asking to
        // remove themselves gets the specific answer; anyone else is simply
        // not allowed to touch the owner.
        if (actor.role === 'owner') {
          throw new LastOwnerError('remove');
        }
        throw new ForbiddenError('The owner cannot be removed');
      }
      if (!canRemoveMember(actor.role, target.role, target.user_id === actor.user_id)) {
        throw new ForbiddenError(`A ${actor.role} cannot remove a ${target.role}`);
      }

      await d.members.removeMember(workspaceId, target.id);
      // The membership row is the live access gate (every request resolves
      // memberships from the database); this also ends sessions tied to the
      // workspace so nothing keeps a stale active workspace.
      await d.sessions.revokeForWorkspace(target.user_id, workspaceId);
      await d.audit.log({
        action: 'member.removed',
        context: input.context,
        workspace_id: workspaceId,
        target_resource_type: 'workspace_member',
        target_resource_id: target.id,
        metadata: { removed_user_id: target.user_id, role: target.role },
      });
      removedUserId = target.user_id;
    });

    await d.mcp.revokeForMember(workspaceId, removedUserId, 'member_removed');
  }
}
