import 'server-only';
import crypto from 'node:crypto';

export class PasswordHasher {
  private static readonly KEY_LENGTH = 64;
  private static readonly SALT_LENGTH = 16;

  /**
   * Hashes a plain password using scrypt with a cryptographically secure random salt.
   * Returns formatted string `scrypt:<salt_hex>:<hash_hex>`.
   */
  static hash(password: string): string {
    const salt = crypto.randomBytes(this.SALT_LENGTH);
    const derivedKey = crypto.scryptSync(password, salt, this.KEY_LENGTH);
    return `scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`;
  }

  /**
   * Verifies a plain password against a stored `scrypt:<salt>:<hash>` formatted string.
   */
  static verify(password: string, storedHash: string): boolean {
    if (!storedHash || typeof storedHash !== 'string') {
      return false;
    }

    const parts = storedHash.split(':');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }

    const saltHex = parts[1];
    const hashHex = parts[2];
    if (!saltHex || !hashHex) {
      return false;
    }

    try {
      const salt = Buffer.from(saltHex, 'hex');
      const expectedKey = Buffer.from(hashHex, 'hex');
      const derivedKey = crypto.scryptSync(password, salt, expectedKey.length);

      return crypto.timingSafeEqual(expectedKey, derivedKey);
    } catch {
      return false;
    }
  }
}
