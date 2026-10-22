import { DomainError, UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import type { ApprovalDecision } from './inbox_item';

// The decider's name travels in `details` (field `decided_by`), not in the
// message: copy maps from the machine code and the client reads the name from
// the item it refetches ("Already approved by Rina").
export class AlreadyDecidedError extends DomainError {
  constructor(decision: ApprovalDecision | 'expired' | 'answered' | 'dismissed' | null, decidedByName: string | null) {
    super({
      message: 'This item was already decided',
      code: 'already_decided',
      status: 409,
      details: [
        { code: 'already_decided', field: 'decision', detail: decision ?? 'unknown' },
        { code: 'already_decided', field: 'decided_by', detail: decidedByName ?? '' },
      ],
    });
    this.name = 'AlreadyDecidedError';
  }
}

export class VersionConflictError extends DomainError {
  constructor() {
    super({
      message: 'This item changed since you opened it. Reload it and try again.',
      code: 'version_conflict',
      status: 409,
    });
    this.name = 'VersionConflictError';
  }
}

export class AwaitingRevisionError extends DomainError {
  constructor() {
    super({
      message: 'A change was requested and the new draft is not ready yet',
      code: 'awaiting_revision',
      status: 409,
    });
    this.name = 'AwaitingRevisionError';
  }
}

export class NotDismissableError extends DomainError {
  constructor() {
    super({ message: 'This item cannot be dismissed', code: 'not_dismissable', status: 409 });
    this.name = 'NotDismissableError';
  }
}

export class InvalidInboxPayloadError extends DomainError {
  constructor(code: 'unsupported_action_type' | 'invalid_payload' | 'field_not_editable' | 'invalid_answer', field: string | null) {
    super({
      message: 'The request is not valid for this item',
      code,
      status: 422,
      field,
      details: [{ code, field, detail: code }],
    });
    this.name = 'InvalidInboxPayloadError';
  }
}

/** The run could not be told the outcome; nothing was committed, so the item stays pending. */
export class RunResumeUnavailableError extends UpstreamUnavailableError {
  constructor() {
    super('The companion could not be reached to continue. Nothing changed, try again.', 'run_resume_unavailable', 503);
    this.name = 'RunResumeUnavailableError';
  }
}

/** A bearer token minted for another audience (MCP) tried a Sineva-session-only action. */
export class WrongTokenAudienceError extends DomainError {
  constructor() {
    super({
      message: 'This action needs a Sineva session',
      code: 'wrong_token_audience',
      status: 403,
    });
    this.name = 'WrongTokenAudienceError';
  }
}
