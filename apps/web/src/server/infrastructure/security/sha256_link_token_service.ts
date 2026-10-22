import 'server-only';
import crypto from 'node:crypto';
import type { LinkTokenService } from '@/server/domain/members/member_ports';

// Why a plain SHA-256 and not a slow password hash: the token is 256 bits of
// CSPRNG output, so there is nothing to brute-force and a slow hash would only
// add latency to every accept.
export class Sha256LinkTokenService implements LinkTokenService {
  generate(): { token: string; hash: string } {
    const token = crypto.randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

/**
 * Constant-time comparison of two hex digests. The repositories call it after
 * the indexed lookup by digest: the lookup key is the digest itself, so this
 * adds no secrecy, but it keeps the final "presented equals stored" decision
 * out of a short-circuiting `===`.
 */
export function digestsEqual(presented: string, stored: string): boolean {
  const a = Buffer.from(presented, 'hex');
  const b = Buffer.from(stored, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
