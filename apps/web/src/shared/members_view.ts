// Wire shapes of the member, invitation and ownership-transfer routes. The
// browser reads these; `server/http/members_view_contract.ts` keeps the server
// side assignable to them. snake_case on purpose (ADR-0003).

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';
export type SpecialistScope = 'all' | 'selected';

/**
 * One row of the members table. The first block is visible to every member;
 * the second block (`email` and below) is present only for callers who hold
 * `member.view_contact` (owner and admin) and is absent, not null, otherwise.
 */
export interface MemberView {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: MemberRole;
  job_title: string | null;
  department: string | null;
  /** v1 has no suspended state: removed people disappear from the list. */
  status: 'active';
  is_you: boolean;
  joined_at: string;
  email?: string;
  phone_number?: string | null;
  /** Latest session activity, or null when the person never signed in. */
  last_active_at?: string | null;
  specialist_scope?: SpecialistScope;
  /** The allowlist; empty unless the scope is `selected`. */
  specialist_slugs?: string[];
}

export type InvitationListState = 'pending' | 'expired';

/** A pending invitation as the owner or admin sees it. Never carries the token. */
export interface InvitationView {
  id: string;
  email: string;
  role: Exclude<MemberRole, 'owner'>;
  specialist_scope: SpecialistScope;
  specialist_slugs: string[];
  state: InvitationListState;
  expires_at: string;
  last_sent_at: string;
  created_at: string;
}

/** Response of create and resend: the only places the plain link is returned. */
export interface InvitationCreatedView {
  invitation: InvitationView;
  /** Full link `{app_url}/invite/{token}`, for copying into WhatsApp. Shown once. */
  invite_url: string;
  /** True when this call replaced an earlier pending invitation for the address. */
  replaced: boolean;
  /** False when the email transport failed; the invitation and link remain valid. */
  email_sent: boolean;
}

export type InvitationPreviewState = 'pending' | 'expired' | 'used' | 'revoked';

/** Public preview behind the token: no email, no ids. */
export interface InvitationPreviewView {
  state: InvitationPreviewState;
  workspace_name: string;
  inviter_first_name: string | null;
  role: Exclude<MemberRole, 'owner'>;
  expires_at: string;
  /**
   * Whether the signed-in account's verified email equals the invited one.
   * null when the caller is signed out. Never reveals the address itself.
   */
  email_matches_session: boolean | null;
}

export interface InvitationAcceptedView {
  workspace: { id: string; workspace_slug: string; workspace_name: string };
  role: MemberRole;
}

export type OwnershipTransferViewState = 'pending' | 'expired';

export interface OwnershipTransferView {
  id: string;
  state: OwnershipTransferViewState;
  expires_at: string;
  created_at: string;
  target: { member_id: string | null; display_name: string };
}

export type OwnershipTransferPreviewState = 'pending' | 'expired' | 'used' | 'cancelled';

export interface OwnershipTransferPreviewView {
  state: OwnershipTransferPreviewState;
  workspace_name: string;
  from_first_name: string | null;
  expires_at: string;
  /** Whether the signed-in account is the one asked to take ownership; null when signed out. */
  is_target: boolean | null;
}

export interface OwnershipTransferAcceptedView {
  workspace: { id: string; workspace_slug: string; workspace_name: string };
  /** False when a notice email could not be delivered; the transfer itself is done. */
  notices_sent: boolean;
}
