import type { UserRole } from '@/server/domain/entities/user';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const OWNERSHIP_TRANSFER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InvitationState = 'pending' | 'expired' | 'used' | 'revoked';

export interface InvitationEntity {
  id: string;
  workspace_id: string;
  /** Lowercase. Never leaves the workspace's own admin views. */
  email: string;
  role: UserRole;
  inviter_user_id: string;
  specialist_scope: 'all' | 'selected';
  specialist_slugs: string[];
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  /** Set once when an expiry was first noticed, so `invitation.expired` is audited once. */
  expired_logged_at: string | null;
  last_sent_at: string;
  created_at: string;
}

export function invitationState(invitation: InvitationEntity, now: Date): InvitationState {
  if (invitation.accepted_at) return 'used';
  if (invitation.revoked_at) return 'revoked';
  return new Date(invitation.expires_at).getTime() <= now.getTime() ? 'expired' : 'pending';
}

export interface OwnershipTransferEntity {
  id: string;
  workspace_id: string;
  from_user_id: string;
  to_user_id: string;
  expires_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export type OwnershipTransferState = 'pending' | 'expired' | 'used' | 'cancelled';

export function ownershipTransferState(
  transfer: OwnershipTransferEntity,
  now: Date,
): OwnershipTransferState {
  if (transfer.accepted_at) return 'used';
  if (transfer.cancelled_at) return 'cancelled';
  return new Date(transfer.expires_at).getTime() <= now.getTime() ? 'expired' : 'pending';
}
