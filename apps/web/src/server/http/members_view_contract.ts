import type {
  InvitationAcceptedView,
  InvitationCreatedView,
  InvitationPreviewView,
  InvitationView,
  MemberView,
  OwnershipTransferAcceptedView,
  OwnershipTransferPreviewView,
  OwnershipTransferView,
} from '@/shared/members_view';
import type { AcceptInvitationUseCase } from '../application/use-cases/members/accept_invitation_use_case';
import type { AcceptOwnershipTransferUseCase } from '../application/use-cases/members/accept_ownership_transfer_use_case';
import type { GetOwnershipTransferUseCase } from '../application/use-cases/members/get_ownership_transfer_use_case';
import type { InviteMemberUseCase } from '../application/use-cases/members/invite_member_use_case';
import type { ListInvitationsUseCase } from '../application/use-cases/members/list_invitations_use_case';
import type { ListMembersUseCase } from '../application/use-cases/members/list_members_use_case';
import type { PreviewInvitationUseCase } from '../application/use-cases/members/preview_invitation_use_case';
import type { PreviewOwnershipTransferUseCase } from '../application/use-cases/members/preview_ownership_transfer_use_case';

// Compile-time drift guard (same approach as `profile_view_contract.ts`): the
// routes serialise what these use cases return and the client types it as the
// views in `src/shared/members_view.ts`, so a renamed or narrowed field fails here.
type AssertAssignable<Sub extends Super, Super> = Sub;

type Resolved<T extends { execute: (...args: never[]) => Promise<unknown> }> = Awaited<
  ReturnType<T['execute']>
>;

export type MembersServedAsView = AssertAssignable<Resolved<ListMembersUseCase>, MemberView[]>;
export type InvitationsServedAsView = AssertAssignable<Resolved<ListInvitationsUseCase>, InvitationView[]>;
export type InvitationCreatedServedAsView = AssertAssignable<
  Resolved<InviteMemberUseCase>,
  InvitationCreatedView
>;
export type InvitationPreviewServedAsView = AssertAssignable<
  Resolved<PreviewInvitationUseCase>,
  InvitationPreviewView
>;
export type InvitationAcceptedServedAsView = AssertAssignable<
  Resolved<AcceptInvitationUseCase>,
  InvitationAcceptedView
>;
export type OwnershipTransferServedAsView = AssertAssignable<
  Resolved<GetOwnershipTransferUseCase>,
  OwnershipTransferView | null
>;
export type OwnershipTransferPreviewServedAsView = AssertAssignable<
  Resolved<PreviewOwnershipTransferUseCase>,
  OwnershipTransferPreviewView
>;
export type OwnershipTransferAcceptedServedAsView = AssertAssignable<
  Resolved<AcceptOwnershipTransferUseCase>,
  OwnershipTransferAcceptedView
>;
