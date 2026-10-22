import 'server-only';
import { ForbiddenError } from '@/server/domain/errors/domain_error';
import { getEnvConfig } from '../infrastructure/config/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CUSTOM_CSRF_HEADER = 'x-sineva-action';

/**
 * Validates requests against Cross-Site Request Forgery (CSRF).
 * - Safe read-only HTTP methods (GET, HEAD, OPTIONS) bypass verification.
 * - Custom header `x-sineva-action` or `x-requested-with` bypasses browser form POST CSRF.
 * - If custom header is absent, `Origin` or `Referer` must match the request's `Host` / `NEXT_PUBLIC_APP_URL`.
 *
 * @throws ForbiddenError when origin check fails on mutating methods.
 */
export function verifyCsrf(request: Request): void {
  const method = request.method.toUpperCase();
  if (SAFE_METHODS.has(method)) {
    return;
  }

  // Requests sending custom headers cannot be forged via simple cross-origin browser form submissions
  const customActionHeader = request.headers.get(CUSTOM_CSRF_HEADER);
  const requestedWithHeader = request.headers.get('x-requested-with');
  if (customActionHeader || requestedWithHeader) {
    return;
  }

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');

  if (!origin && !referer) {
    throw new ForbiddenError('Missing request origin for mutating operation');
  }

  let originUrl: URL;
  try {
    originUrl = origin ? new URL(origin) : new URL(referer!);
  } catch {
    throw new ForbiddenError('Malformed request origin or referer header');
  }

  // Compare host and port together. Matching on hostname alone would accept a
  // page served from another port of the same machine, which is a different origin.
  if (host && originUrl.host === host) {
    return;
  }

  const env = getEnvConfig();
  if (env.next_public_app_url) {
    try {
      const allowedAppUrl = new URL(env.next_public_app_url);
      if (originUrl.origin === allowedAppUrl.origin) {
        return;
      }
    } catch {
      // Invalid NEXT_PUBLIC_APP_URL
    }
  }

  throw new ForbiddenError(`CSRF origin validation failed: ${originUrl.origin}`);
}
