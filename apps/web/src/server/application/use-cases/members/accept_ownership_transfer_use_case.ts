import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { EmailSender } from '@/server/domain/email/email_sender';
import {
  DependencyUnavailableError,
  ForbiddenError,
  NotFoundError,
} from '@/server/domain/errors/domain_error';
import { ownershipTransferState } from '@/server/domain/members/invitation';
import {
  OwnershipTransferNotFoundError,
  OwnershipTransferStateError,
} from '@/server/domain/members/member_errors';
import type { Clock, LinkTokenService, MemberAccountLookup } from '@/server/domain/members/member_ports';
import type { OwnershipTransferRepository } from '@/server/domain/repositories/ownership_transfer_repository';
import type { WorkspaceMemberRepository } from '@/server/domain/repositories/workspace_member_repository';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { OwnershipTransferAcceptedView } from '@/shared/members_view';
import { displayName, emailLocale } from './member_support';

export interface AcceptOwnershipTransferDeps {
  members: WorkspaceMemberRepository;
  transfers: OwnershipTransferRepository;
  accounts: MemberAccountLookup;
  workspaces: Pick<WorkspaceRepository, 'findById'>;
  tokens: LinkTokenService;
  email: EmailSender;
  audit: AuditLogger;
  transactions: TransactionRunner;
  clock: Clock;
}

export class AcceptOwnershipTransferUseCase {
  constructor(private readonly deps: AcceptOwnershipTransferDeps) {}

  async execute(input: { token: string; context: RequestContext }): Promise<OwnershipTransferAcceptedView> {
    const d = this.deps;
    const now = d.clock();

    const transfer = await d.transfers.findByTokenHash(d.tokens.hash(input.token));
    if (!transfer) {
      throw new OwnershipTransferNotFoundError();
    }
    const state = ownershipTransferState(transfer, now);
    if (state !== 'pending') {
      throw new OwnershipTransferStateError(state);
    }
    // Bound to the one account the owner chose: a forwarded link is useless.
    if (input.context.user_id !== transfer.to_user_id) {
      throw new ForbiddenError('This ownership transfer is for a different account');
    }
    const workspace = await d.workspaces.findById(transfer.workspace_id);
    if (!workspace) {
      throw new NotFoundError('Workspace', transfer.workspace_id);
    }

    await d.transactions.run(async () => {
      // Same lock as every other membership change, so the swap cannot
      // interleave with a removal or a role edit of either party.
      await d.members.lockWorkspace(transfer.workspace_id);
      // Single-use guard: of two concurrent accepts exactly one flips the row.
      if (!(await d.transfers.claim(transfer.id, now))) {
        throw new OwnershipTransferStateError('used');
      }
      // Fails without writing when the owner or the target changed role since
      // the request (removed, demoted, or the owner already moved on).
      if (!(await d.members.swapOwner(transfer.workspace_id, transfer.from_user_id, transfer.to_user_id))) {
        throw new OwnershipTransferStateError('stale');
      }
      await d.audit.log({
        action: 'workspace.ownership_transferred',
        context: input.context,
        workspace_id: transfer.workspace_id,
        target_resource_type: 'workspace',
        target_resource_id: transfer.workspace_id,
        metadata: {
          transfer_id: transfer.id,
          from_user_id: transfer.from_user_id,
          to_user_id: transfer.to_user_id,
        },
        change: { before: { owner_user_id: transfer.from_user_id }, after: { owner_user_id: transfer.to_user_id } },
      });
    });

    // Notices after commit: the swap is done whether or not mail leaves, so a
    // delivery failure is reported to the caller instead of undoing it.
    const [previousOwner, newOwner] = await Promise.all([
      d.accounts.findById(transfer.from_user_id),
      d.accounts.findById(transfer.to_user_id),
    ]);
    let noticesSent = true;
    for (const [recipient, other, role] of [
      [newOwner, previousOwner, 'owner'],
      [previousOwner, newOwner, 'admin'],
    ] as const) {
      if (!recipient || !other) {
        noticesSent = false;
        continue;
      }
      try {
        await d.email.send({
          to: recipient.email,
          template: 'ownership_transferred_notice',
          locale: emailLocale(recipient.locale),
          params: {
            recipient_name: displayName(recipient),
            workspace_name: workspace.workspace_name,
            other_name: displayName(other),
            new_role: role,
          },
        });
      } catch (error) {
        if (!(error instanceof DependencyUnavailableError)) {
          throw error;
        }
        noticesSent = false;
      }
    }

    return {
      workspace: {
        id: workspace.id,
        workspace_slug: workspace.workspace_slug,
        workspace_name: workspace.workspace_name,
      },
      notices_sent: noticesSent,
    };
  }
}
