import { describe, expect, it } from 'vitest';
import { validateScanUrl } from '@/server/domain/onboarding/scan_url';
import { ValidationError } from '@/server/domain/errors/domain_error';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as ValidationError).details?.[0]?.code;
  }
  return undefined;
}

describe('scan URL pre-check (FR-ONB-10, FR-ONB-13, FR-SEC-38)', () => {
  it('accepts a public http or https URL and returns it normalised', () => {
    expect(validateScanUrl('https://tokokopi.example/')).toBe('https://tokokopi.example/');
    expect(validateScanUrl('  http://TokoKopi.example/menu  ')).toBe('http://tokokopi.example/menu');
  });

  it.each([
    'ftp://tokokopi.example/',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'not a url',
    'https://user:pass@tokokopi.example/',
  ])('rejects %s as an invalid scan URL', (url) => {
    expect(codeOf(() => validateScanUrl(url))).toBe('invalid_scan_url');
  });

  it.each([
    'http://localhost/',
    'http://127.0.0.1/',
    'http://10.0.0.5/',
    'http://172.16.4.4/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.64.0.1/',
    'http://0.0.0.0/',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://2130706433/',
    'http://0x7f.0.0.1/',
    'http://intranet/',
    'http://printer.local/',
    'http://db.internal/',
    'http://tokokopi.example:8080/',
  ])('blocks the private or internal target %s', (url) => {
    expect(codeOf(() => validateScanUrl(url))).toBe('blocked_scan_target');
  });

  it.each([
    'https://www.instagram.com/tokokopi',
    'https://tokopedia.com/tokokopi',
    'https://shopee.co.id/tokokopi',
    'https://www.tiktok.com/@tokokopi',
    'https://m.facebook.com/tokokopi',
  ])('refuses the social or marketplace page %s: stored as a link only', (url) => {
    expect(codeOf(() => validateScanUrl(url))).toBe('unsupported_scan_source');
  });

  it('rejects an over-long URL', () => {
    expect(codeOf(() => validateScanUrl(`https://tokokopi.example/${'a'.repeat(2100)}`))).toBe('invalid_scan_url');
  });
});
