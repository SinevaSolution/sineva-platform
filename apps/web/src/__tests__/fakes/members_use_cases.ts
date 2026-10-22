import { AcceptInvitationUseCase } from '@/server/application/use-cases/members/accept_invitation_use_case';
import { AcceptOwnershipTransferUseCase } from '@/server/application/use-cases/members/accept_ownership_transfer_use_case';
import { CancelOwnershipTransferUseCase } from '@/server/application/use-cases/members/cancel_ownership_transfer_use_case';
import { GetMemberUseCase } from '@/server/application/use-cases/members/get_member_use_case';
import { GetOwnershipTransferUseCase } from '@/server/application/use-cases/members/get_ownership_transfer_use_case';
import { InviteMemberUseCase } from '@/server/application/use-cases/members/invite_member_use_case';
import { LeaveWorkspaceUseCase } from '@/server/application/use-cases/members/leave_workspace_use_case';
import { ListInvitationsUseCase } from '@/server/application/use-cases/members/list_invitations_use_case';
import { ListMembersUseCase } from '@/server/application/use-cases/members/list_members_use_case';
import { PreviewInvitationUseCase } from '@/server/application/use-cases/members/preview_invitation_use_case';
import { PreviewOwnershipTransferUseCase } from '@/server/application/use-cases/members/preview_ownership_transfer_use_case';
import { RemoveMemberUseCase } from '@/server/application/use-cases/members/remove_member_use_case';
import { RequestOwnershipTransferUseCase } from '@/server/application/use-cases/members/request_ownership_transfer_use_case';
import { ResendInvitationUseCase } from '@/server/application/use-cases/members/resend_invitation_use_case';
import { RevokeInvitationUseCase } from '@/server/application/use-cases/members/revoke_invitation_use_case';
import { SetMemberSpecialistsUseCase } from '@/server/application/use-cases/members/set_member_specialists_use_case';
import { UpdateMemberUseCase } from '@/server/application/use-cases/members/update_member_use_case';
import type { MembersWorld } from './members_world';

export const KNOWN_SLUGS = ['sinopeople', 'sinofinance', 'sinosales'] as const;
export const APP_URL = 'https://app.sineva.test';

/** Wires every member use case onto one in-memory world, the way the container wires the real adapters. */
export function buildMemberUseCases(world: MembersWorld) {
  const base = {
    members: world.members,
    audit: world.audit,
    transactions: world.transactions,
    clock: world.clock,
    knownSpecialistSlugs: KNOWN_SLUGS,
  };
  const update = new UpdateMemberUseCase({ ...base, mcp: world.mcpRevoker });
  return {
    invite: new InviteMemberUseCase({
      ...base,
      invitations: world.invitations,
      accounts: world.accounts,
      workspaces: world.workspaces,
      tokens: world.tokens,
      email: world.emails,
      entitlements: world.entitlements,
      appUrl: APP_URL,
    }),
    listInvitations: new ListInvitationsUseCase({ invitations: world.invitations, clock: world.clock }),
    resend: new ResendInvitationUseCase({
      ...base,
      invitations: world.invitations,
      accounts: world.accounts,
      workspaces: world.workspaces,
      tokens: world.tokens,
      email: world.emails,
      appUrl: APP_URL,
    }),
    revoke: new RevokeInvitationUseCase({ ...base, invitations: world.invitations }),
    previewInvitation: new PreviewInvitationUseCase({
      invitations: world.invitations,
      accounts: world.accounts,
      workspaces: world.workspaces,
      tokens: world.tokens,
      clock: world.clock,
    }),
    acceptInvitation: new AcceptInvitationUseCase({
      ...base,
      invitations: world.invitations,
      accounts: world.accounts,
      workspaces: world.workspaces,
      tokens: world.tokens,
      entitlements: world.entitlements,
    }),
    listMembers: new ListMembersUseCase({ members: world.members }),
    getMember: new GetMemberUseCase({ members: world.members }),
    update,
    setSpecialists: new SetMemberSpecialistsUseCase(update),
    remove: new RemoveMemberUseCase({
      ...base,
      sessions: world.sessionRevoker,
      mcp: world.mcpRevoker,
    }),
    leave: new LeaveWorkspaceUseCase({
      ...base,
      sessions: world.sessionRevoker,
      mcp: world.mcpRevoker,
    }),
    requestTransfer: new RequestOwnershipTransferUseCase({
      ...base,
      transfers: world.transfers,
      accounts: world.accounts,
      workspaces: world.workspaces,
      tokens: world.tokens,
      email: world.emails,
      appUrl: APP_URL,
    }),
    getTransfer: new GetOwnershipTransferUseCase({
      members: world.members,
      transfers: world.transfers,
      accounts: world.accounts,
      clock: world.clock,
    }),
    cancelTransfer: new CancelOwnershipTransferUseCase({ ...base, transfers: world.transfers }),
    previewTransfer: new PreviewOwnershipTransferUseCase({
      transfers: world.transfers,
      accounts: world.accounts,
      workspaces: world.workspaces,
      tokens: world.tokens,
      clock: world.clock,
    }),
    acceptTransfer: new AcceptOwnershipTransferUseCase({
      ...base,
      transfers: world.transfers,
      accounts: world.accounts,
      workspaces: world.workspaces,
      tokens: world.tokens,
      email: world.emails,
    }),
  };
}
