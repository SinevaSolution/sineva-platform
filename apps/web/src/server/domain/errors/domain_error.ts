import type { ErrorDetail } from '@sineva/shared';

export class DomainError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly field: string | null;
  public readonly details: ErrorDetail[];

  constructor(options: {
    message: string;
    code: string;
    status?: number;
    field?: string | null;
    details?: ErrorDetail[];
  }) {
    super(options.message);
    this.name = 'DomainError';
    this.code = options.code;
    this.status = options.status ?? 400;
    this.field = options.field ?? null;
    this.details = options.details ?? [
      {
        code: options.code,
        field: this.field,
        detail: options.message,
      },
    ];
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, identifier: string) {
    super({
      message: `${resource} '${identifier}' was not found`,
      code: 'RESOURCE_NOT_FOUND',
      status: 404,
      field: null,
    });
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details: ErrorDetail[]) {
    super({
      message,
      code: 'validation_failed',
      status: 422,
      details,
    });
    this.name = 'ValidationError';
  }
}

export class MalformedJsonError extends DomainError {
  constructor(detail = 'Invalid or malformed JSON payload') {
    super({
      message: 'Request payload validation failed',
      code: 'validation_failed',
      status: 422,
      field: null,
      details: [
        {
          code: 'validation_failed',
          field: null,
          detail,
        },
      ],
    });
    this.name = 'MalformedJsonError';
  }
}

export class ConflictError extends DomainError {
  constructor(resource: string, identifier: string) {
    super({
      message: `${resource} '${identifier}' already exists`,
      code: 'RESOURCE_CONFLICT',
      status: 409,
      field: null,
    });
    this.name = 'ConflictError';
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Access forbidden') {
    super({
      message,
      code: 'forbidden',
      status: 403,
      field: null,
    });
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Authentication required') {
    super({
      message,
      code: 'unauthenticated',
      status: 401,
      field: null,
    });
    this.name = 'UnauthorizedError';
  }
}

// sineva-ai answered, but not with a usable reply: non-2xx status or a body
// that fails contract validation. Messages are client-safe on purpose; the
// upstream status and body are logged server-side by the adapter instead.
export class UpstreamServiceError extends DomainError {
  constructor(
    message = 'The AI engine returned an unexpected response',
    code = 'UPSTREAM_ERROR',
    status = 502,
  ) {
    super({
      message,
      code,
      status,
      field: null,
    });
    this.name = 'UpstreamServiceError';
  }
}

// sineva-ai could not be reached at all: network failure, timeout or abort.
export class UpstreamUnavailableError extends DomainError {
  constructor(
    message = 'The AI engine is unavailable',
    code = 'UPSTREAM_UNAVAILABLE',
    status = 503,
  ) {
    super({
      message,
      code,
      status,
      field: null,
    });
    this.name = 'UpstreamUnavailableError';
  }
}

// Upstream model unavailable, overloaded, or rate-limited
export class ModelUnavailableError extends DomainError {
  constructor(message = 'The AI model is currently overloaded or unavailable') {
    super({
      message,
      code: 'model_unavailable',
      status: 503,
      field: null,
    });
    this.name = 'ModelUnavailableError';
  }
}

// Signed context token is invalid or rejected by upstream
// Since the platform minted the token, this is an internal server error (500)
export class ContextInvalidError extends DomainError {
  constructor(message = 'Signed context token or claims are invalid') {
    super({
      message,
      code: 'context_invalid',
      status: 500,
      field: null,
    });
    this.name = 'ContextInvalidError';
  }
}

// Required infrastructure dependency unavailable (database, cache, storage, email transport)
export class DependencyUnavailableError extends DomainError {
  constructor(message = 'A required infrastructure dependency is unavailable') {
    super({
      message,
      code: 'dependency_unavailable',
      status: 503,
      field: null,
    });
    this.name = 'DependencyUnavailableError';
  }
}

// Signed context token exceeds header budget (assumed 8KB, fail closed)
export class ContextTooLargeError extends DomainError {
  constructor(message = 'Context token exceeds header budget (8KB)') {
    super({
      message,
      code: 'context_too_large',
      status: 500,
      field: null,
    });
    this.name = 'ContextTooLargeError';
  }
}

// Too many requests of one kind. `retry_after_seconds` becomes the
// `Retry-After` header so a client knows when to try again (FR-SEC-36).
export class RateLimitedError extends DomainError {
  constructor(
    message = 'Too many requests, try again later',
    public readonly retry_after_seconds = 60,
    code = 'rate_limited',
  ) {
    super({
      message,
      code,
      status: 429,
      field: null,
    });
    this.name = 'RateLimitedError';
  }
}

// A person may not create their first workspace: they already have one, or an
// invitation is waiting for them. `reason` is the machine detail code the
// client maps to copy.
export class FirstWorkspaceNotAllowedError extends DomainError {
  constructor(public readonly reason: 'already_has_workspace' | 'invited_user') {
    super({
      message:
        reason === 'invited_user'
          ? 'You have a pending invitation. Accept it to join the workspace.'
          : 'You already belong to a workspace.',
      code: reason,
      status: 409,
      field: null,
    });
    this.name = 'FirstWorkspaceNotAllowedError';
  }
}

