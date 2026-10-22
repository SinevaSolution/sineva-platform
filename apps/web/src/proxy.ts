import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  buildCspReportOnly,
  CSP_REPORT_ONLY_HEADER,
  generateNonce,
  NONCE_REQUEST_HEADER,
} from '@/server/http/csp';

/**
 * Sanitizes the `next` redirect parameter to prevent open-redirect phishing attacks.
 * Only allows safe relative paths starting with `/` (and disallows protocol-relative `//`).
 */
export function sanitizeNextRedirect(rawPath?: string | null, fallback: string = '/'): string {
  if (!rawPath || typeof rawPath !== 'string') {
    return fallback;
  }

  const trimmed = rawPath.trim();

  // Must begin with single `/` and NOT `//`
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback;
  }

  // Reject URLs containing protocol schemes before a query/hash
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return fallback;
  }

  // Reject javascript:, data:, vbscript: pseudo-protocols
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

/**
 * Cheap edge/proxy page rejection: unauthenticated page requests are redirected
 * to `/sign-in?next=...`. This never replaces the authoritative application-layer check (FR-AUTH-22).
 */
// Auth screens a signed-out visitor must be able to reach. The emailed
// verify and reset links land here before any session exists.
const PUBLIC_PAGES = new Set(['/', '/sign-in', '/sign-up', '/forgot-password', '/reset-password', '/verify-email']);

export function proxyPageGuard(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname;

  // Static assets and API endpoints are ignored by the page guard
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.') ||
    PUBLIC_PAGES.has(pathname)
  ) {
    return null;
  }

  // Check session cookie
  const sessionToken =
    request.cookies.get('sineva_session')?.value ||
    request.cookies.get('better-auth.session_token')?.value;

  if (!sessionToken) {
    const nextPath = sanitizeNextRedirect(request.nextUrl.pathname + request.nextUrl.search);
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('next', nextPath);
    return NextResponse.redirect(signInUrl);
  }

  return null;
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildCspReportOnly(nonce, { production: process.env.NODE_ENV === 'production' });

  // Next.js reads the nonce from the request's CSP header to tag its own inline
  // scripts; the root layout reads `x-nonce` for the theme script.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_REQUEST_HEADER, nonce);
  requestHeaders.set(CSP_REPORT_ONLY_HEADER, csp);

  const response =
    proxyPageGuard(request) ?? NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CSP_REPORT_ONLY_HEADER, csp);
  return response;
}

export default proxy;

