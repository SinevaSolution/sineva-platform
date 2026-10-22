import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { LastOwnerError } from '@/server/domain/members/member_errors';
import type { McpGrantRevoker, MemberSessionRevoker } from '@/server/domain/members/member_ports';
import type { WorkspaceMemberRepository } from '@/server/domain/repositories/workspace_member_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import { requireWorkspaceId } from './member_support';

export interface LeaveWorkspaceDeps {
  members: WorkspaceMemberRepository;
  audit: AuditLogger;
  transactions: TransactionRunner;
  sessions: MemberSessionRevoker;
  mcp: McpGrantRevoker;
}

export class LeaveWorkspaceUseCase {
  constructor(private readonly deps: LeaveWorkspaceDeps) {}

  /** The caller leaves the URL workspace. The owner cannot: ownership moves first. */
  async execute(input: { context: RequestContext }): Promise<void> {
    const d = this.deps;
    const workspaceId = requireWorkspaceId(input.context);

    await d.transactions.run(async () => {
      await d.members.lockWorkspace(workspaceId);
      const member = await d.members.findMembership(workspaceId, input.context.user_id);
      if (!member) {
        throw new NotFoundError('Workspace', workspaceId);
      }
      if (member.role === 'owner') {
        throw new LastOwnerError('leave');
      }
      await d.members.removeMember(workspaceId, member.id);
      await d.sessions.revokeForWorkspace(member.user_id, workspaceId);
      await d.audit.log({
        action: 'member.left',
        context: input.context,
        workspace_id: workspaceId,
        target_resource_type: 'workspace_member',
        target_resource_id: member.id,
        metadata: { role: member.role },
      });
    });

    await d.mcp.revokeForMember(workspaceId, input.context.user_id, 'member_left');
  }
}
