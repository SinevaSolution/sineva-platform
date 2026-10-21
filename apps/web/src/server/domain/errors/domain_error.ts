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
  constructor(message = 'The AI engine returned an unexpected response') {
    super({
      message,
      code: 'UPSTREAM_ERROR',
      status: 502,
      field: null,
    });
    this.name = 'UpstreamServiceError';
  }
}

// sineva-ai could not be reached at all: network failure, timeout or abort.
export class UpstreamUnavailableError extends DomainError {
  constructor(message = 'The AI engine is unavailable') {
    super({
      message,
      code: 'UPSTREAM_UNAVAILABLE',
      status: 503,
      field: null,
    });
    this.name = 'UpstreamUnavailableError';
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

