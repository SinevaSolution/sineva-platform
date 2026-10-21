import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import {
  createErrorResponse,
  createPaginatedResponse,
  createSuccessResponse,
  generateRequestId,
  type ApiErrorCode,
  type CreateErrorResponseOptions,
  type CreatePaginatedResponseOptions,
  type CreateSuccessResponseOptions,
} from '@sineva/shared';
import { DomainError, MalformedJsonError } from '@/server/domain/errors/domain_error';

export function extractRequestId(request?: Request | NextRequest | null): string {
  const headerId = request?.headers?.get('x-request-id')?.trim();
  if (headerId && headerId.length > 0) {
    return headerId;
  }
  return generateRequestId();
}

export async function parseJsonBody(request: Request | NextRequest): Promise<unknown> {
  let text: string;
  try {
    text = await request.text();
  } catch (err) {
    throw new MalformedJsonError(
      err instanceof Error ? err.message : 'Failed to read request body',
    );
  }

  if (!text || text.trim().length === 0) {
    throw new MalformedJsonError('Request body cannot be empty');
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new MalformedJsonError(
      err instanceof Error ? err.message : 'Invalid JSON format',
    );
  }
}

function mapStatusToErrorCode(status: number): ApiErrorCode {
  switch (status) {
    case 400:
    case 422:
      return 'validation_failed';
    case 401:
      return 'unauthenticated';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 502:
      return 'model_unavailable';
    case 503:
      return 'dependency_unavailable';
    case 500:
    default:
      return 'internal_error';
  }
}

export function sendSuccessJson<T>(
  options: CreateSuccessResponseOptions<T>,
  init?: ResponseInit,
): NextResponse {
  const requestId = options.request_id ?? generateRequestId();
  const payload = createSuccessResponse({
    ...options,
    request_id: requestId,
  });
  const res = NextResponse.json(payload, {
    ...init,
    status: payload.status,
  });
  res.headers.set('X-Request-Id', requestId);
  return res;
}

export function sendErrorJson<T = null>(
  options: CreateErrorResponseOptions<T>,
  init?: ResponseInit,
): NextResponse {
  const requestId = options.request_id ?? generateRequestId();
  const payload = createErrorResponse({
    ...options,
    request_id: requestId,
  });
  const res = NextResponse.json(payload, {
    ...init,
    status: payload.status,
  });
  res.headers.set('X-Request-Id', requestId);
  return res;
}

export function sendPaginatedJson<T>(
  options: CreatePaginatedResponseOptions<T>,
  init?: ResponseInit,
): NextResponse {
  const requestId = options.request_id ?? generateRequestId();
  const payload = createPaginatedResponse({
    ...options,
    request_id: requestId,
  });
  const res = NextResponse.json(payload, {
    ...init,
    status: payload.status,
  });
  res.headers.set('X-Request-Id', requestId);
  return res;
}

export function handleRouteError(
  error: unknown,
  request?: Request | NextRequest | null,
): NextResponse {
  const requestId = extractRequestId(request);

  if (error instanceof ZodError) {
    const details = error.errors.map((issue) => ({
      code: 'validation_failed',
      field: issue.path.join('.') || null,
      detail: issue.message,
    }));
    const payload = createErrorResponse({
      message: 'Request payload validation failed',
      code: 'validation_failed',
      status: 422,
      request_id: requestId,
      errors: details,
    });
    const res = NextResponse.json(payload, { status: 422 });
    res.headers.set('X-Request-Id', requestId);
    return res;
  }

  if (error instanceof DomainError) {
    const code = mapStatusToErrorCode(error.status);
    const details = error.details.map((d) => ({
      ...d,
      code: d.code.toLowerCase() === 'validation_error' ? 'validation_failed' : d.code,
    }));
    const payload = createErrorResponse({
      message: error.message,
      code,
      status: error.status,
      request_id: requestId,
      errors: details,
    });
    const res = NextResponse.json(payload, { status: error.status });
    res.headers.set('X-Request-Id', requestId);
    return res;
  }

  // SEC-5: Log the actual error with request_id, but return fixed message to client
  console.error(`[server-error] request_id=${requestId}`, error);

  const payload = createErrorResponse({
    message: 'Internal server error',
    code: 'internal_error',
    status: 500,
    request_id: requestId,
    errors: [
      {
        code: 'internal_error',
        field: null,
        detail: 'An unexpected internal error occurred. Please contact support with this request ID.',
      },
    ],
  });
  const res = NextResponse.json(payload, { status: 500 });
  res.headers.set('X-Request-Id', requestId);
  return res;
}
