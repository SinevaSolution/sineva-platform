import { ValidationError } from '@/server/domain/errors/domain_error';

// Pre-check of the URL a person asks Sino to read. It is a fast 422 and a
// second line of defence only: DNS can still point a public name at a private
// address, so the authoritative SSRF control is the post-resolution check in
// the sineva-ai fetcher (per hop, redirects capped). This function never
// resolves DNS on purpose; a lookup here would be a second SSRF-capable fetch
// path in the platform.

const MAX_URL_LENGTH = 2048;

// Instagram and marketplace pages block anonymous reading, so v1.0 stores them
// as links and handles only (FR-ONB-13). Matched on the registrable suffix.
const LINK_ONLY_HOSTS = [
  'instagram.com',
  'facebook.com',
  'fb.com',
  'tiktok.com',
  'tokopedia.com',
  'shopee.co.id',
  'shopee.com',
  'lazada.co.id',
  'bukalapak.com',
  'blibli.com',
];

const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet', '.corp'];

function fail(code: string, detail: string): never {
  throw new ValidationError(detail, [{ code, field: 'source_url', detail }]);
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map(Number);
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/**
 * Returns the normalised URL or throws a 422 with one of `invalid_scan_url`,
 * `blocked_scan_target`, `unsupported_scan_source`.
 */
export function validateScanUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) {
    fail('invalid_scan_url', 'The link is empty or too long.');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return fail('invalid_scan_url', 'The link is not a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fail('invalid_scan_url', 'Only http and https links can be read.');
  }
  if (url.username || url.password) {
    fail('invalid_scan_url', 'Links with a user name or password are not accepted.');
  }

  // The WHATWG parser has already turned decimal, octal and hex IPv4 forms
  // (2130706433, 0x7f.1) into dotted quads, so one check covers them.
  const host = url.hostname.toLowerCase();

  if (host.startsWith('[')) {
    // Any IPv6 literal is refused rather than range-checked: no honest SME site
    // is addressed by a bare IPv6 literal, and mapped forms make range checks error prone.
    fail('blocked_scan_target', 'This address cannot be read.');
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateIpv4(host)) {
      fail('blocked_scan_target', 'This address cannot be read.');
    }
    // A public IP literal is allowed through to the fetcher's own checks.
  } else {
    if (host === 'localhost' || INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix)) || !host.includes('.')) {
      fail('blocked_scan_target', 'This address cannot be read.');
    }
  }

  // Default ports only: a scan has no reason to reach an arbitrary service port.
  if (url.port !== '') {
    fail('blocked_scan_target', 'Only the standard web ports can be read.');
  }

  if (LINK_ONLY_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    fail('unsupported_scan_source', 'Social and marketplace pages are saved as links and are not read.');
  }

  return url.toString();
}
