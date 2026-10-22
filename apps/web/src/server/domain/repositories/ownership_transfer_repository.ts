import type { OwnershipTransferEntity } from '../members/invitation';

export interface CreateOwnershipTransferInput {
  from_user_id: string;
  to_user_id: string;
  token_hash: string;
  expires_at: Date;
}

export interface OwnershipTransferRepository {
  /**
   * Starts a transfer. At most one is open per workspace, so any earlier open
   * one is cancelled in the same call; its id is returned for the audit row.
   */
  createPending(
    workspaceId: string,
    input: CreateOwnershipTransferInput,
  ): Promise<{ transfer: OwnershipTransferEntity; replaced_transfer_id: string | null }>;
  /** The open (not accepted, not cancelled) transfer of the workspace, expired or not. */
  findOpen(workspaceId: string): Promise<OwnershipTransferEntity | null>;
  findByTokenHash(tokenHash: string): Promise<OwnershipTransferEntity | null>;
  /** @returns false when the transfer was no longer open. */
  cancel(workspaceId: string, transferId: string, at: Date): Promise<boolean>;
  /** Single-use guard, same contract as `InvitationRepository.claimAcceptance`. */
  claim(transferId: string, at: Date): Promise<boolean>;
}
