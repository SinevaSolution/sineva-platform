// Small fetch wrapper for the platform API. Unwraps the response envelope,
// sends the CSRF header that mutating routes expect, and turns failures into
// an `ApiError` with a message that is safe to show.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
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
    throw new ApiError('You seem to be offline. Check your connection and try again.', 0);
  }

  let envelope: Envelope<T> | null = null;
  try {
    envelope = (await response.json()) as Envelope<T>;
  } catch {
    envelope = null;
  }

  if (!response.ok || !envelope?.success) {
    throw new ApiError(friendlyMessage(response.status, envelope?.message), response.status);
  }
  return envelope.data as T;
}

function friendlyMessage(status: number, serverMessage?: string): string {
  if (status === 401) return 'Your session ended. Sign in again to continue.';
  if (status === 403) return "You don't have access to this yet. Ask an admin.";
  if (status === 429) return 'Too many tries. Wait a moment, then try again.';
  if (status === 502 || status === 503) {
    return "We couldn't reach Sino right now. Try again in a moment.";
  }
  return serverMessage ?? 'Something went wrong. Try again.';
}
