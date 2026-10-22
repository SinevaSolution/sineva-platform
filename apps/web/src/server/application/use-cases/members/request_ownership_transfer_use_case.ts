import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { EmailSender } from '@/server/domain/email/email_sender';
import { ForbiddenError, NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';
import { OWNERSHIP_TRANSFER_TTL_MS } from '@/server/domain/members/invitation';
import type { Clock, LinkTokenService, MemberAccountLookup } from '@/server/domain/members/member_ports';
import type { OwnershipTransferRepository } from '@/server/domain/repositories/ownership_transfer_repository';
import type { WorkspaceMemberRepository } from '@/server/domain/repositories/workspace_member_repository';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { OwnershipTransferView } from '@/shared/members_view';
import { displayName, emailLocale, requireWorkspaceId } from './member_support';

export interface RequestOwnershipTransferDeps {
  members: WorkspaceMemberRepository;
  transfers: OwnershipTransferRepository;
  accounts: MemberAccountLookup;
  workspaces: Pick<WorkspaceRepository, 'findById'>;
  tokens: LinkTokenService;
  email: EmailSender;
  audit: AuditLogger;
  transactions: TransactionRunner;
  clock: Clock;
  appUrl: string;
}

export class RequestOwnershipTransferUseCase {
  constructor(private readonly deps: RequestOwnershipTransferDeps) {}

  /**
   * The owner names an existing admin; nothing changes until that admin
   * confirms through the emailed link. The email goes out inside the
   * transaction on purpose: there is no copy-the-link path for a transfer, so
   * a transfer whose email failed would be open but unreachable. A failure
   * rolls the request back and the owner sees the error and can retry.
   */
  async execute(input: {
    context: RequestContext;
    target_member_id: string;
  }): Promise<OwnershipTransferView> {
    const d = this.deps;
    const workspaceId = requireWorkspaceId(input.context);

    const transfer = await d.transactions.run(async () => {
      await d.members.lockWorkspace(workspaceId);
      const actor = await d.members.findMembership(workspaceId, input.context.user_id);
      if (!actor || actor.role !== 'owner') {
        throw new ForbiddenError('Only the owner can transfer ownership');
      }
      const target = await d.members.findById(workspaceId, input.target_member_id);
      if (!target) {
        throw new NotFoundError('Workspace member', input.target_member_id);
      }
      if (target.role !== 'admin') {
        throw new ValidationError('Ownership can only go to an existing admin', [
          {
            code: 'target_must_be_admin',
            field: 'target_member_id',
            detail: 'Promote the person to admin first, then transfer ownership',
          },
        ]);
      }

      const [workspace, targetAccount, ownerAccount] = await Promise.all([
        d.workspaces.findById(workspaceId),
        d.accounts.findById(target.user_id),
        d.accounts.findById(actor.user_id),
      ]);
      if (!workspace || !targetAccount || !ownerAccount) {
        throw new NotFoundError('Workspace member', input.target_member_id);
      }

      const { token, hash } = d.tokens.generate();
      const now = d.clock();
      const { transfer: created, replaced_transfer_id } = await d.transfers.createPending(workspaceId, {
        from_user_id: actor.user_id,
        to_user_id: target.user_id,
        token_hash: hash,
        expires_at: new Date(now.getTime() + OWNERSHIP_TRANSFER_TTL_MS),
      });
      await d.audit.log({
        action: 'workspace.ownership_transfer_requested',
        context: input.context,
        workspace_id: workspaceId,
        target_resource_type: 'ownership_transfer',
        target_resource_id: created.id,
        metadata: {
          target_member_id: target.id,
          replaced_transfer_id: replaced_transfer_id ?? undefined,
        },
      });
      await d.email.send({
        to: targetAccount.email,
        template: 'ownership_transfer_request',
        locale: emailLocale(targetAccount.locale),
        params: {
          recipient_name: displayName(targetAccount),
          url: `${d.appUrl.replace(/\/$/, '')}/ownership/${token}`,
          workspace_name: workspace.workspace_name,
          from_name: displayName(ownerAccount),
          expires_in_days: 7,
        },
      });
      return {
        id: created.id,
        state: 'pending' as const,
        expires_at: created.expires_at,
        created_at: created.created_at,
        target: { member_id: target.id, display_name: displayName(targetAccount) },
      };
    });

    return transfer;
  }
}
