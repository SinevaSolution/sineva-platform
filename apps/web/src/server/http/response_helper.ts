import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  createErrorResponse,
  createPaginatedResponse,
  createSuccessResponse,
  type CreatePaginatedResponseOptions,
  type CreateSuccessResponseOptions,
} from '@sineva/shared';
import { DomainError } from '@/server/domain/errors/domain_error';

export function sendSuccessJson<T>(
  options: CreateSuccessResponseOptions<T>,
): NextResponse {
  const payload = createSuccessResponse(options);
  return NextResponse.json(payload, { status: payload.status });
}

export function sendPaginatedJson<T>(
  options: CreatePaginatedResponseOptions<T>,
): NextResponse {
  const payload = createPaginatedResponse(options);
  return NextResponse.json(payload, { status: payload.status });
}

export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    const details = error.errors.map((issue) => ({
      code: 'VALIDATION_ERROR',
      field: issue.path.join('.') || null,
      detail: issue.message,
    }));
    const payload = createErrorResponse({
      message: 'Request payload validation failed',
      status: 422,
      errors: details,
    });
    return NextResponse.json(payload, { status: 422 });
  }

  if (error instanceof DomainError) {
    const payload = createErrorResponse({
      message: error.message,
      status: error.status,
      errors: error.details,
    });
    return NextResponse.json(payload, { status: error.status });
  }

  const message =
    error instanceof Error ? error.message : 'Unexpected server error';
  const payload = createErrorResponse({
    message,
    status: 500,
  });
  return NextResponse.json(payload, { status: 500 });
}
