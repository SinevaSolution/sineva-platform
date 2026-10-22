// Small fetch wrapper for the platform API. Unwraps the response envelope,
// sends the CSRF header that mutating routes expect, and turns failures into
// an `ApiError` that carries the machine code. What the person reads comes
// from `apiErrorKey` and the `errors` catalog, never from the server `message`
// (which is English, developer-facing and may name internals).

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Top-level envelope code, e.g. `unauthenticated` or `model_unavailable`. */
    readonly code?: string,
    /** Codes of the envelope's `errors[]`, e.g. `breached_password`. */
    readonly detailCodes: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 502 and 503 mean "try again"; everything else needs a change first. */
  get retryable(): boolean {
    return this.status === 502 || this.status === 503;
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
  errors?: Array<{ code?: string }> | null;
}

export async function apiRequest<T>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  const method = init.method ?? 'GET';
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'x-sineva-action': '1' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('Network request failed', 0, 'network');
  }

  let envelope: Envelope<T> | null = null;
  try {
    envelope = (await response.json()) as Envelope<T>;
  } catch {
    envelope = null;
  }

  if (!response.ok || !envelope?.success) {
    throw new ApiError(
      envelope?.message ?? `Request failed with ${response.status}`,
      response.status,
      envelope?.code,
      (envelope?.errors ?? []).flatMap((e) => (e.code ? [e.code] : [])),
    );
  }
  return envelope.data as T;
}

// Literal keys on purpose: the key-usage check follows string literals, and a
// computed `api.${code}` would hide them from it.
const DETAIL_KEYS: Record<string, string> = {
  breached_password: 'api.breached_password',
  invalid_password: 'api.invalid_password',
  terms_required: 'api.terms_required',
  privacy_required: 'api.privacy_required',
};

const CODE_KEYS: Record<string, string> = {
  network: 'api.network',
  unauthenticated: 'api.unauthenticated',
  forbidden: 'api.forbidden',
  not_found: 'api.not_found',
  conflict: 'api.conflict',
  validation_failed: 'api.validation_failed',
  rate_limited: 'api.rate_limited',
  internal_error: 'api.internal_error',
  model_unavailable: 'api.model_unavailable',
  dependency_unavailable: 'api.dependency_unavailable',
};

// Used when the envelope had no code (a proxy page, a dropped body).
const STATUS_KEYS: Record<number, string> = {
  0: 'api.network',
  401: 'api.unauthenticated',
  403: 'api.forbidden',
  404: 'api.not_found',
  409: 'api.conflict',
  422: 'api.validation_failed',
  429: 'api.rate_limited',
  500: 'api.internal_error',
  502: 'api.model_unavailable',
  503: 'api.dependency_unavailable',
};

/**
 * Key in the `errors` namespace for a failed call: a specific detail code
 * first (a breached password is a different fix than a short one), then the
 * envelope code, then the HTTP status.
 */
export function apiErrorKey(error: unknown): string {
  if (!(error instanceof ApiError)) return 'api.generic';
  for (const code of error.detailCodes) {
    const key = DETAIL_KEYS[code];
    if (key) return key;
  }
  return (error.code && CODE_KEYS[error.code]) || STATUS_KEYS[error.status] || 'api.generic';
}
