import type { RequestContext } from '@/server/domain/context/request_context';
import { ownershipTransferState } from '@/server/domain/members/invitation';
import type { Clock, MemberAccountLookup } from '@/server/domain/members/member_ports';
import type { OwnershipTransferRepository } from '@/server/domain/repositories/ownership_transfer_repository';
import type { WorkspaceMemberRepository } from '@/server/domain/repositories/workspace_member_repository';
import type { OwnershipTransferView } from '@/shared/members_view';
import { displayName, requireWorkspaceId } from './member_support';

export class GetOwnershipTransferUseCase {
  constructor(
    private readonly deps: {
      members: WorkspaceMemberRepository;
      transfers: OwnershipTransferRepository;
      accounts: MemberAccountLookup;
      clock: Clock;
    },
  ) {}

  /** The open transfer of the workspace, or null. The token is never part of it. */
  async execute(input: { context: RequestContext }): Promise<OwnershipTransferView | null> {
    const d = this.deps;
    const workspaceId = requireWorkspaceId(input.context);
    const transfer = await d.transfers.findOpen(workspaceId);
    if (!transfer) {
      return null;
    }
    const [account, member] = await Promise.all([
      d.accounts.findById(transfer.to_user_id),
      d.members.findMembership(workspaceId, transfer.to_user_id),
    ]);
    const state = ownershipTransferState(transfer, d.clock());
    return {
      id: transfer.id,
      state: state === 'expired' ? 'expired' : 'pending',
      expires_at: transfer.expires_at,
      created_at: transfer.created_at,
      target: {
        member_id: member?.id ?? null,
        display_name: account ? displayName(account) : '',
      },
    };
  }
}
