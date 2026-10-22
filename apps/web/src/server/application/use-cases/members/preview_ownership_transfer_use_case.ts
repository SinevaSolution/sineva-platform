import { ownershipTransferState } from '@/server/domain/members/invitation';
import { OwnershipTransferNotFoundError } from '@/server/domain/members/member_errors';
import type { Clock, LinkTokenService, MemberAccountLookup } from '@/server/domain/members/member_ports';
import type { OwnershipTransferRepository } from '@/server/domain/repositories/ownership_transfer_repository';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import type { OwnershipTransferPreviewView } from '@/shared/members_view';
import { firstName } from './member_support';

export class PreviewOwnershipTransferUseCase {
  constructor(
    private readonly deps: {
      transfers: OwnershipTransferRepository;
      accounts: MemberAccountLookup;
      workspaces: Pick<WorkspaceRepository, 'findById'>;
      tokens: LinkTokenService;
      clock: Clock;
    },
  ) {}

  async execute(input: { token: string; viewer_user_id?: string }): Promise<OwnershipTransferPreviewView> {
    const d = this.deps;
    const transfer = await d.transfers.findByTokenHash(d.tokens.hash(input.token));
    if (!transfer) {
      throw new OwnershipTransferNotFoundError();
    }
    const [workspace, from] = await Promise.all([
      d.workspaces.findById(transfer.workspace_id),
      d.accounts.findById(transfer.from_user_id),
    ]);
    return {
      state: ownershipTransferState(transfer, d.clock()),
      workspace_name: workspace?.workspace_name ?? '',
      from_first_name: from ? firstName(from) : null,
      expires_at: transfer.expires_at,
      is_target: input.viewer_user_id ? input.viewer_user_id === transfer.to_user_id : null,
    };
  }
}
