import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ForbiddenError, NotFoundError } from '@/server/domain/errors/domain_error';
import type { Clock } from '@/server/domain/members/member_ports';
import type { OwnershipTransferRepository } from '@/server/domain/repositories/ownership_transfer_repository';
import type { WorkspaceMemberRepository } from '@/server/domain/repositories/workspace_member_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import { requireWorkspaceId } from './member_support';

export class CancelOwnershipTransferUseCase {
  constructor(
    private readonly deps: {
      members: WorkspaceMemberRepository;
      transfers: OwnershipTransferRepository;
      audit: AuditLogger;
      transactions: TransactionRunner;
      clock: Clock;
    },
  ) {}

  async execute(input: { context: RequestContext }): Promise<void> {
    const d = this.deps;
    const workspaceId = requireWorkspaceId(input.context);

    await d.transactions.run(async () => {
      await d.members.lockWorkspace(workspaceId);
      const actor = await d.members.findMembership(workspaceId, input.context.user_id);
      if (!actor || actor.role !== 'owner') {
        throw new ForbiddenError('Only the owner can cancel an ownership transfer');
      }
      const open = await d.transfers.findOpen(workspaceId);
      if (!open || !(await d.transfers.cancel(workspaceId, open.id, d.clock()))) {
        throw new NotFoundError('Ownership transfer', workspaceId);
      }
      await d.audit.log({
        action: 'workspace.ownership_transfer_cancelled',
        context: input.context,
        workspace_id: workspaceId,
        target_resource_type: 'ownership_transfer',
        target_resource_id: open.id,
      });
    });
  }
}
