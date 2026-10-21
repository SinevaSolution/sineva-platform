export interface ResponseMeta {
  page?: number;
  per_page?: number;
  total_items?: number;
  total_pages?: number;
  has_next?: boolean;
  has_prev?: boolean;
  request_id: string;
  timestamp: string;
}

export interface PaginationMeta extends ResponseMeta {
  page: number;
  per_page: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export type ApiErrorCode =
  | 'validation_failed'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'model_unavailable'
  | 'dependency_unavailable'
  | 'internal_error'
  | string;

export interface ErrorDetail {
  code: string;
  field: string | null;
  detail: string;
}

export interface ApiResponse<T> {
  success: boolean;
  status: number;
  message: string;
  code?: ApiErrorCode;
  data: T | null;
  meta: ResponseMeta | null;
  errors: ErrorDetail[] | null;
}

export interface CreateSuccessResponseOptions<T> {
  data: T;
  message?: string;
  status?: number;
  request_id?: string;
}

export interface CreatePaginatedResponseOptions<T> {
  items: T[];
  page: number;
  per_page: number;
  total_items: number;
  message?: string;
  status?: number;
  request_id?: string;
}

export interface CreateErrorResponseOptions {
  message: string;
  status?: number;
  code?: ApiErrorCode;
  errors?: ErrorDetail[];
  request_id?: string;
}

export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  return `req_${Date.now()}_${randomSuffix}`;
}

export function createSuccessResponse<T>(
  options: CreateSuccessResponseOptions<T>,
): ApiResponse<T> {
  const status = options.status ?? 200;
  const message = options.message ?? 'Operation completed successfully';
  const request_id = options.request_id ?? generateRequestId();

  return {
    success: true,
    status,
    message,
    data: options.data,
    meta: {
      request_id,
      timestamp: new Date().toISOString(),
    },
    errors: null,
  };
}

export function createPaginatedResponse<T>(
  options: CreatePaginatedResponseOptions<T>,
): ApiResponse<T[]> {
  const status = options.status ?? 200;
  const message = options.message ?? 'Paginated records fetched successfully';
  const request_id = options.request_id ?? generateRequestId();
  const safePerPage = Math.max(1, options.per_page);
  const safePage = Math.max(1, options.page);
  const total_pages = Math.max(1, Math.ceil(options.total_items / safePerPage));

  const meta: PaginationMeta = {
    page: safePage,
    per_page: safePerPage,
    total_items: options.total_items,
    total_pages,
    has_next: safePage < total_pages,
    has_prev: safePage > 1,
    request_id,
    timestamp: new Date().toISOString(),
  };

  return {
    success: true,
    status,
    message,
    data: options.items,
    meta,
    errors: null,
  };
}

export function createErrorResponse(
  options: CreateErrorResponseOptions,
): ApiResponse<null> {
  const status = options.status ?? 500;
  const request_id = options.request_id ?? generateRequestId();
  const errors: ErrorDetail[] =
    options.errors && options.errors.length > 0
      ? options.errors
      : [
          {
            code: options.code ?? 'INTERNAL_SERVER_ERROR',
            field: null,
            detail: options.message,
          },
        ];

  return {
    success: false,
    status,
    message: options.message,
    code: options.code,
    data: null,
    meta: {
      request_id,
      timestamp: new Date().toISOString(),
    },
    errors,
  };
}
