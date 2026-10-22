import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { UserRole } from '@/server/domain/entities/user';
import { ForbiddenError, NotFoundError } from '@/server/domain/errors/domain_error';
import { LastOwnerError } from '@/server/domain/members/member_errors';
import { canChangeRole, roleHasMcpUse, scopeApplies } from '@/server/domain/members/member_policy';
import type { McpGrantRevoker } from '@/server/domain/members/member_ports';
import { hasPermission } from '@/server/domain/permissions/registry';
import type { WorkspaceMemberRepository } from '@/server/domain/repositories/workspace_member_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { MemberView } from '@/shared/members_view';
import { normalizeAllowlist, requireWorkspaceId, scopeNotApplicable, toMemberView } from './member_support';

export interface UpdateMemberDeps {
  members: WorkspaceMemberRepository;
  audit: AuditLogger;
  transactions: TransactionRunner;
  mcp: McpGrantRevoker;
  knownSpecialistSlugs: readonly string[];
}

export interface UpdateMemberInput {
  context: RequestContext;
  member_id: string;
  role?: UserRole;
  specialist_scope?: 'all' | 'selected';
  specialist_slugs?: string[];
}

export class UpdateMemberUseCase {
  constructor(private readonly deps: UpdateMemberDeps) {}

  async execute(input: UpdateMemberInput): Promise<MemberView> {
    const d = this.deps;
    const workspaceId = requireWorkspaceId(input.context);
    // An object, not a `let`: TypeScript does not see assignments made inside the callback.
    const outcome = { dropsMcp: false };

    const entry = await d.transactions.run(async () => {
      // Serializes with every other role change, removal and ownership
      // transfer of this workspace; the actor and target are read after the
      // lock so a decision is never made on a role that has since changed.
      await d.members.lockWorkspace(workspaceId);
      const actor = await d.members.findMembership(workspaceId, input.context.user_id);
      if (!actor) {
        throw new ForbiddenError('Membership is required for this action');
      }
      const target = await d.members.findById(workspaceId, input.member_id);
      if (!target) {
        throw new NotFoundError('Workspace member', input.member_id);
      }
      const isSelf = target.user_id === actor.user_id;
      // Copied first: an adapter may hand back live rows, and the audit and the
      // MCP check below need the values from before the change.
      const previous = { role: target.role, scope: target.specialist_scope };
      let effectiveRole: UserRole = previous.role;

      if (input.role !== undefined && input.role !== previous.role) {
        if (previous.role === 'owner' && actor.role === 'owner') {
          // The only owner demoting themselves would orphan the workspace.
          throw new LastOwnerError('demote');
        }
        if (!canChangeRole(actor.role, previous.role, input.role, isSelf)) {
          throw new ForbiddenError(`A ${actor.role} cannot change a ${previous.role} to ${input.role}`);
        }
        await d.members.updateRole(workspaceId, target.id, input.role);
        effectiveRole = input.role;
        if (!scopeApplies(input.role) && previous.scope === 'selected') {
          // Scope exists for members only; a stale allowlist on another role would be dead data.
          await d.members.updateAccess(workspaceId, target.id, { specialist_scope: 'all', specialist_slugs: [] });
        }
        await d.audit.log({
          action: 'member.role_changed',
          context: input.context,
          workspace_id: workspaceId,
          target_resource_type: 'workspace_member',
          target_resource_id: target.id,
          change: { before: { role: previous.role }, after: { role: input.role } },
        });
        if (roleHasMcpUse(previous.role) && !roleHasMcpUse(input.role)) {
          outcome.dropsMcp = true;
        }
      }

      if (input.specialist_scope !== undefined) {
        if (!hasPermission(actor.role, 'member.update_access').allowed) {
          throw new ForbiddenError(`A ${actor.role} cannot change specialist access`);
        }
        if (!scopeApplies(effectiveRole)) {
          throw scopeNotApplicable(effectiveRole);
        }
        const before = { specialist_scope: previous.scope };
        const current = await d.members.getDirectoryEntry(workspaceId, target.id);
        const beforeSlugs = current?.specialist_slugs ?? [];
        const nextSlugs =
          input.specialist_scope === 'selected'
            ? normalizeAllowlist(
                input.specialist_slugs !== undefined ? input.specialist_slugs : beforeSlugs,
                d.knownSpecialistSlugs,
              )
            : [];
        await d.members.updateAccess(workspaceId, target.id, {
          specialist_scope: input.specialist_scope,
          specialist_slugs: nextSlugs,
        });
        await d.audit.log({
          action: 'member.specialist_access_changed',
          context: input.context,
          workspace_id: workspaceId,
          target_resource_type: 'workspace_member',
          target_resource_id: target.id,
          change: {
            before: { ...before, specialist_slugs: beforeSlugs },
            after: { specialist_scope: input.specialist_scope, specialist_slugs: nextSlugs },
          },
        });
      }

      const updated = await d.members.getDirectoryEntry(workspaceId, target.id);
      if (!updated) {
        throw new NotFoundError('Workspace member', input.member_id);
      }
      return updated;
    });

    if (outcome.dropsMcp) {
      // After commit: the hook talks to another system and must not hold the row lock.
      await d.mcp.revokeForMember(workspaceId, entry.member.user_id, 'role_changed');
    }
    // Only roles with member.update_access get here, and they all hold member.view_contact.
    return toMemberView(entry, input.context.user_id, true);
  }
}
