/**
 * Sanitizes a `next` / `return_to` value to prevent open-redirect phishing.
 * Only a same-origin relative path is allowed: it must start with a single
 * `/`, never `//`, and never a backslash anywhere in the path part, because
 * browsers read `/\evil.example` as `//evil.example`.
 *
 * Lives in `domain` so the edge proxy and the application layer apply the
 * same rule.
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

  // WHATWG URL parsing treats `\` like `/` for http(s), so `/\host` is `//host`.
  if (trimmed.includes('\\')) {
    return fallback;
  }

  // Control characters (tab, CR, LF) are stripped by URL parsers, which can
  // turn `/\t/evil.example` into `//evil.example`.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return fallback;
  }

  // Reject URLs containing protocol schemes before a query/hash
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}
