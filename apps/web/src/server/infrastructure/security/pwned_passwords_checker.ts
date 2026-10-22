import 'server-only';
import crypto from 'node:crypto';
import type { BreachedPasswordChecker } from '@/server/domain/auth/breached_password_checker';
import { logger } from '../logging/logger';

/**
 * Checks passwords against HaveIBeenPwned Pwned Passwords Range API using k-Anonymity (SHA-1 prefix).
 * Per D-M0-12, fails open with a logged warning if the service is unreachable or errors
 * to avoid blocking legitimate user sign-ups during external vendor outages.
 */
export class PwnedPasswordsBreachedChecker implements BreachedPasswordChecker {
  private readonly apiUrl: string;
  private readonly timeoutMs: number;

  constructor(options?: { apiUrl?: string; timeoutMs?: number }) {
    this.apiUrl = options?.apiUrl ?? 'https://api.pwnedpasswords.com/range';
    this.timeoutMs = options?.timeoutMs ?? 2000;
  }

  async isBreached(password: string): Promise<boolean> {
    try {
      const sha1 = crypto
        .createHash('sha1')
        .update(password)
        .digest('hex')
        .toUpperCase();
      const prefix = sha1.slice(0, 5);
      const suffix = sha1.slice(5);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(`${this.apiUrl}/${prefix}`, {
        headers: {
          'Add-Padding': 'true', // K-anonymity padding to prevent response size leakage
          'User-Agent': 'Sineva-Security-Audit/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        logger.warn('breach_check.failed', { status: response.status, reason: 'fail_open' });
        return false;
      }

      const body = await response.text();
      const lines = body.split(/\r?\n/);

      for (const line of lines) {
        const [hashSuffix] = line.split(':');
        if (hashSuffix && hashSuffix.trim().toUpperCase() === suffix) {
          return true;
        }
      }

      return false;
    } catch (err) {
      logger.warn('breach_check.failed', { reason: err instanceof Error ? err.name : 'unknown' });
      return false;
    }
  }
}
