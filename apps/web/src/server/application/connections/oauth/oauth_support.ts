import { createHash, randomBytes } from 'node:crypto';
import type { OAuthResultCode } from '@/server/domain/connections/oauth_flow';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 256 bits of randomness, URL safe. Used for the OAuth `state`. */
export function newState(): string {
  return randomBytes(32).toString('base64url');
}

/** PKCE S256 pair: a 256-bit verifier and its challenge (RFC 7636). */
export function newPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function newNonce(): string {
  return randomBytes(16).toString('base64url');
}

const MAX_RETURN_TO = 512;

/**
 * `return_to` is where the callback sends the person afterwards. It is
 * accepted only as a relative path under `/w/`: anything with a scheme, a host,
 * a protocol-relative start, a backslash, a control character or a dot segment
 * is rejected, so the redirect can never leave this app (no open redirect).
 * Returns null for anything that does not qualify.
 */
export function sanitizeReturnTo(raw: string): string | null {
  if (raw.length === 0 || raw.length > MAX_RETURN_TO) return null;
  if (!raw.startsWith('/w/') || raw.startsWith('//')) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  const path = raw.split(/[?#]/)[0]!;
  // An empty segment (`/w//x`) is harmless on the same origin but is the shape
  // of a protocol-relative trick, so it is refused rather than reasoned about.
  if (path.includes('//')) return null;
  if (path.split('/').some((segment) => segment === '..' || segment === '.')) return null;
  const parsed = new URL(raw, 'https://app.invalid');
  if (parsed.origin !== 'https://app.invalid' || !parsed.pathname.startsWith('/w/')) return null;
  return raw;
}

/** The callback's 302 target: the stored return path plus the result, never anything from the provider. */
export function resultRedirect(
  returnTo: string,
  result: OAuthResultCode,
  extra: { provider_id?: string; connection_id?: string } = {},
): string {
  const url = new URL(returnTo, 'https://app.invalid');
  url.searchParams.set('connection_result', result);
  if (extra.provider_id) url.searchParams.set('provider_id', extra.provider_id);
  if (extra.connection_id) url.searchParams.set('connection_id', extra.connection_id);
  return `${url.pathname}${url.search}`;
}
