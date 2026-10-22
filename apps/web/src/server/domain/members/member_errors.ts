import { DomainError } from '@/server/domain/errors/domain_error';

// Each error carries a stable machine `code` (the UI maps copy from it, never
// from the message). State conflicts use 409 on purpose: the envelope maps a
// status to its top-level code and has no entry for 410, so a "gone" status
// would surface as `internal_error`.

export class AlreadyMemberError extends DomainError {
  constructor() {
    super({
      message: 'Already in this workspace',
      code: 'already_member',
      status: 409,
      field: 'email',
    });
    this.name = 'AlreadyMemberError';
  }
}

export class LastOwnerError extends DomainError {
  constructor(action: 'leave' | 'remove' | 'demote') {
    super({
      message: `The owner cannot ${action}. Transfer ownership to an admin first.`,
      code: 'last_owner',
      status: 409,
      field: null,
    });
    this.name = 'LastOwnerError';
  }
}

export class InvitationNotFoundError extends DomainError {
  constructor() {
    super({
      message: 'This invitation was not found',
      code: 'invitation_not_found',
      status: 404,
      field: null,
    });
    this.name = 'InvitationNotFoundError';
  }
}

export class InvitationStateError extends DomainError {
  constructor(state: 'expired' | 'used' | 'revoked') {
    super({
      message:
        state === 'expired'
          ? 'This invitation has expired. Ask the owner to send a new one.'
          : state === 'used'
            ? 'This invitation was already used.'
            : 'This invitation was cancelled.',
      code: `invitation_${state}`,
      status: 409,
      field: null,
    });
    this.name = 'InvitationStateError';
  }
}

export class InvitationEmailMismatchError extends DomainError {
  constructor() {
    super({
      message: 'This invitation was sent to a different email address. Sign in with the invited account.',
      code: 'invitation_email_mismatch',
      status: 403,
      field: null,
    });
    this.name = 'InvitationEmailMismatchError';
  }
}

export class EmailNotVerifiedError extends DomainError {
  constructor() {
    super({
      message: 'Verify your email address before accepting.',
      code: 'email_not_verified',
      status: 403,
      field: null,
    });
    this.name = 'EmailNotVerifiedError';
  }
}

export class OwnershipTransferNotFoundError extends DomainError {
  constructor() {
    super({
      message: 'This ownership transfer was not found',
      code: 'ownership_transfer_not_found',
      status: 404,
      field: null,
    });
    this.name = 'OwnershipTransferNotFoundError';
  }
}

export class OwnershipTransferStateError extends DomainError {
  constructor(state: 'expired' | 'used' | 'cancelled' | 'stale') {
    super({
      message:
        state === 'expired'
          ? 'This ownership transfer has expired. Ask the owner to start a new one.'
          : state === 'stale'
            ? 'The workspace changed since this transfer started. Ask the owner to start a new one.'
            : state === 'used'
              ? 'This ownership transfer was already completed.'
              : 'This ownership transfer was cancelled.',
      code: `ownership_transfer_${state}`,
      status: 409,
      field: null,
    });
    this.name = 'OwnershipTransferStateError';
  }
}
