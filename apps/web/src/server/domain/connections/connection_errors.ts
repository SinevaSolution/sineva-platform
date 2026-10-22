import { DomainError } from '@/server/domain/errors/domain_error';

/** The provider cannot be used in this environment right now. */
export class ProviderUnavailableError extends DomainError {
  constructor(providerId: string, reason: 'coming_soon' | 'credentials_not_configured') {
    const code = reason === 'coming_soon' ? 'provider_coming_soon' : 'provider_not_configured';
    super({
      message: 'This tool cannot be connected right now',
      code,
      status: 409,
      details: [{ code, field: 'provider_id', detail: providerId }],
    });
    this.name = 'ProviderUnavailableError';
  }
}

export class OwnerScopeNotAllowedError extends DomainError {
  constructor(providerId: string) {
    super({
      message: 'This tool cannot be connected for one person only',
      code: 'owner_scope_not_allowed',
      status: 422,
      details: [{ code: 'owner_scope_not_allowed', field: 'owner_scope', detail: providerId }],
    });
    this.name = 'OwnerScopeNotAllowedError';
  }
}

/** The same external account is already connected here (offer reconnect instead). */
export class DuplicateAccountError extends DomainError {
  constructor(readonly connection_id: string) {
    super({
      message: 'This account is already connected',
      code: 'duplicate_account',
      status: 409,
      details: [{ code: 'duplicate_account', field: 'connection_id', detail: connection_id }],
    });
    this.name = 'DuplicateAccountError';
  }
}

export class ConnectionRevokedError extends DomainError {
  constructor(connectionId: string) {
    super({
      message: 'This connection was disconnected',
      code: 'connection_revoked',
      status: 409,
      details: [{ code: 'connection_revoked', field: 'connection_id', detail: connectionId }],
    });
    this.name = 'ConnectionRevokedError';
  }
}

export class NotReconnectableError extends DomainError {
  constructor(connectionId: string) {
    super({
      message: 'This connection uses a pasted key; replace the key instead',
      code: 'not_reconnectable',
      status: 409,
      details: [{ code: 'not_reconnectable', field: 'connection_id', detail: connectionId }],
    });
    this.name = 'NotReconnectableError';
  }
}

/** The provider did not answer or answered badly while we talked to it for the caller. */
export class ProviderUnreachableError extends DomainError {
  constructor() {
    super({
      message: 'The tool could not be reached',
      code: 'provider_unreachable',
      status: 503,
      details: [{ code: 'provider_unreachable', field: null, detail: 'The provider did not answer' }],
    });
    this.name = 'ProviderUnreachableError';
  }
}

/** The API-key test rejected the pasted key. `reason` is safe to show; it never quotes the key. */
export class ConnectionTestFailedError extends DomainError {
  constructor(reason: 'invalid_credentials' | 'insufficient_permissions') {
    super({
      message: 'The key was not accepted',
      code: 'validation_failed',
      status: 422,
      field: 'secret',
      details: [{ code: 'connection_test_failed', field: 'secret', detail: reason }],
    });
    this.name = 'ConnectionTestFailedError';
  }
}

/** What the connection layer reports when a step fails but the action goes on. A port so the layer stays free of the logger. */
export type ConnectionStep =
  | 'callback_failed'
  | 'verifier_erase'
  | 'provider_revoke'
  | 'refresh_failed'
  | 'refresh_retry'
  | 'health_failed'
  | 'inbox_notify_failed'
  | 'reconcile_failed';

export interface ConnectionLog {
  failed(step: ConnectionStep, detail: { workspace_id?: string; connection_id?: string; provider_id?: string; code?: string }): void;
}
