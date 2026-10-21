import { describe, expect, it, vi, afterEach } from 'vitest';
import { PwnedPasswordsBreachedChecker } from '@/server/infrastructure/security/pwned_passwords_checker';
import crypto from 'node:crypto';

describe('PwnedPasswordsBreachedChecker (D-M0-12, k-Anonymity)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('detects a breached password when suffix is found in range response', async () => {
    const password = 'password123456';
    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const suffix = sha1.slice(5);

    const mockResponseText = `0018A45C4D63AE5D13F71F1A3ED766563D0:2\n${suffix}:450\nFE5D2D5B:1`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockResponseText),
    } as unknown as Response);

    const checker = new PwnedPasswordsBreachedChecker();
    const isBreached = await checker.isBreached(password);

    expect(isBreached).toBe(true);
  });

  it('returns false when password suffix is not in range response', async () => {
    const password = 'extremelySafeUnbreachedPassword987!@#';

    const mockResponseText = `0018A45C4D63AE5D13F71F1A3ED766563D0:2\n002B48:10`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockResponseText),
    } as unknown as Response);

    const checker = new PwnedPasswordsBreachedChecker();
    const isBreached = await checker.isBreached(password);

    expect(isBreached).toBe(false);
  });

  it('fails open (returns false) when external API returns non-200 status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('Service Unavailable'),
    } as unknown as Response);

    const checker = new PwnedPasswordsBreachedChecker();
    const isBreached = await checker.isBreached('anyPassword123');

    expect(isBreached).toBe(false);
  });

  it('fails open (returns false) when network error occurs', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const checker = new PwnedPasswordsBreachedChecker();
    const isBreached = await checker.isBreached('anyPassword123');

    expect(isBreached).toBe(false);
  });
});
