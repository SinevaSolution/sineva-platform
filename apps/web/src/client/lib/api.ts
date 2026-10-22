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
    /** Field name to detail code for a 422, so a form can mark the field that failed. */
    readonly fieldCodes: Record<string, string> = {},
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
  errors?: Array<{ code?: string; field?: string | null }> | null;
}

export async function apiRequest<T>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown } = {},
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
      Object.fromEntries(
        (envelope?.errors ?? []).flatMap((e) =>
          e.field && e.code ? [[e.field, e.code] as const] : [],
        ),
      ),
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
  unsupported_image: 'api.unsupported_image',
  image_too_large: 'api.image_too_large',
  invalid_image: 'api.invalid_image',
  upload_failed: 'api.upload_failed',
  already_member: 'api.already_member',
  last_owner: 'api.last_owner',
  invitation_expired: 'api.invitation_expired',
  invitation_used: 'api.invitation_used',
  invitation_revoked: 'api.invitation_revoked',
  invitation_not_found: 'api.invitation_not_found',
  invitation_email_mismatch: 'api.invitation_email_mismatch',
  email_not_verified: 'api.email_not_verified',
  ownership_transfer_expired: 'api.ownership_transfer_expired',
  ownership_transfer_used: 'api.ownership_transfer_used',
  ownership_transfer_cancelled: 'api.ownership_transfer_cancelled',
  ownership_transfer_stale: 'api.ownership_transfer_stale',
  fresh_session_required: 'api.fresh_session_required',
  cannot_remove_last_sign_in_method: 'api.cannot_remove_last_sign_in_method',
  account_in_use: 'api.account_in_use',
  provider_already_linked: 'api.provider_already_linked',
  target_must_be_admin: 'api.target_must_be_admin',
  allowlist_required: 'api.allowlist_required',
  scope_not_applicable: 'api.scope_not_applicable',
  unknown_specialist: 'api.unknown_specialist',
  oauth_account_mismatch: 'api.oauth_account_mismatch',
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
