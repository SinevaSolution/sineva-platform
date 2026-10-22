// Content Security Policy builder. Pure and runtime-neutral: the proxy calls it
// for every request, so it must not import Node-only modules.
//
// Report-only for now. Enforcing needs the card media proxy to exist first (it
// decides the `img-src` allowlist), and a violation report endpoint to watch
// before the switch. Until then the header only surfaces violations in the
// browser console.

export interface CspOptions {
  production: boolean;
}

/**
 * Scripts run only with the per-request nonce. `'strict-dynamic'` lets those
 * trusted scripts load their own chunks, which is how Next.js bootstraps, so no
 * host allowlist or `'unsafe-inline'` is needed. `style-src` keeps
 * `'unsafe-inline'` because component libraries set inline style attributes and
 * nonces do not apply to attributes.
 */
export function buildCspReportOnly(nonce: string, options: CspOptions): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  const connectSrc = ["'self'"];

  if (!options.production) {
    // React's development build evaluates code for debugging, and the dev server
    // pushes updates over a local websocket.
    scriptSrc.push("'unsafe-eval'");
    connectSrc.push('http://localhost:*', 'ws://localhost:*');
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export const CSP_REPORT_ONLY_HEADER = 'Content-Security-Policy-Report-Only';
export const NONCE_REQUEST_HEADER = 'x-nonce';

/** 128 bits of randomness, base64 as the CSP nonce grammar requires. */
export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}
