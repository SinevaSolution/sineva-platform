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
      code: 'VALIDATION_ERROR',
      status: 422,
      details,
    });
    this.name = 'ValidationError';
  }
}
