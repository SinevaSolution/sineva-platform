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
import { DomainError, MalformedJsonError, RateLimitedError } from '@/server/domain/errors/domain_error';
import { logger } from '@/server/infrastructure/logging/logger';

// A client-supplied id ends up in logs, headers and the envelope, so only a
// bounded token is trusted. Anything else (CR/LF, spaces, 300 characters) is
// replaced rather than sanitized: a partial id would break cross-service tracing.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

export function extractRequestId(request?: Request | NextRequest | null): string {
  const headerId = request?.headers?.get('x-request-id')?.trim();
  if (headerId && SAFE_REQUEST_ID.test(headerId)) {
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

/**
 * Like `parseJsonBody` for routes whose body is optional (a scheduler calling
 * a trigger endpoint): an empty body is `{}`, malformed JSON is still a typed 422.
 */
export async function parseOptionalJsonBody(request: Request | NextRequest): Promise<unknown> {
  const text = await request.clone().text();
  if (!text || text.trim().length === 0) {
    return {};
  }
  return parseJsonBody(request);
}

/** Query string as a plain object for a Zod schema (a repeated key keeps its last value). */
export function searchParamsToObject(request: Request | NextRequest): Record<string, string> {
  const query: Record<string, string> = {};
  new URL(request.url).searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return query;
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
    case 429:
      return 'rate_limited';
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
    if (error instanceof RateLimitedError) {
      res.headers.set('Retry-After', String(error.retry_after_seconds));
    }
    return res;
  }

  // SEC-5: fixed message to the client; the log keeps the request id and the
  // error class only, since driver and Prisma messages can quote row data.
  logger.error('http.unhandled_error', {
    request_id: requestId,
    reason: error instanceof Error ? error.name : 'unknown',
  });

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
