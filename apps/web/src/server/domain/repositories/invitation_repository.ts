import type { UserRole } from '../entities/user';
import type { InvitationEntity } from '../members/invitation';

export interface UpsertPendingInvitationInput {
  email: string;
  role: UserRole;
  inviter_user_id: string;
  specialist_scope: 'all' | 'selected';
  specialist_slugs: string[];
  token_hash: string;
  expires_at: Date;
  sent_at: Date;
}

export interface InvitationRepository {
  /**
   * Creates the pending invitation for (workspace, email), or replaces the
   * existing pending one in place (new token digest, role, scope, expiry) so
   * the old link stops working. `replaced` tells the caller which happened.
   */
  upsertPending(
    workspaceId: string,
    input: UpsertPendingInvitationInput,
  ): Promise<{ invitation: InvitationEntity; replaced: boolean }>;
  /** Looks up by the stored digest only; the plain token never reaches the repository. */
  findByTokenHash(tokenHash: string): Promise<InvitationEntity | null>;
  findById(workspaceId: string, invitationId: string): Promise<InvitationEntity | null>;
  /** Neither accepted nor revoked; expired rows stay listed so the owner can resend them. */
  listOpen(workspaceId: string): Promise<InvitationEntity[]>;
  /** New digest and expiry for an open invitation (resend). */
  replaceToken(
    workspaceId: string,
    invitationId: string,
    tokenHash: string,
    expiresAt: Date,
    sentAt: Date,
  ): Promise<InvitationEntity>;
  /** @returns false when the invitation was no longer open. */
  revoke(workspaceId: string, invitationId: string, at: Date): Promise<boolean>;
  /**
   * Single-use guard: marks the invitation accepted only if it is still open.
   * Two concurrent accepts race on this and exactly one gets `true`.
   */
  claimAcceptance(invitationId: string, at: Date): Promise<boolean>;
  /** @returns true only for the first caller, so the expiry is audited once. */
  markExpiredLogged(invitationId: string, at: Date): Promise<boolean>;
}
