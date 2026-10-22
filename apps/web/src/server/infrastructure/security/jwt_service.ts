import 'server-only';
import crypto from 'node:crypto';

export interface SinevaJwtClaims {
  sub: string; // user_id
  jti: string; // session_id (UUID)
  email: string;
  name: string;
  email_verified: boolean;
  active_workspace_id?: string | null;
  role?: string;
  fresh_until: number; // Unix timestamp in seconds
  iat: number; // Issued at (seconds)
  exp: number; // Expiration (seconds)
  [key: string]: unknown;
}

export interface JwtSignOptions {
  expiresInSeconds?: number;
}

export class JwtService {
  private static base64UrlEncode(input: string | Buffer): string {
    return Buffer.from(input).toString('base64url');
  }

  private static base64UrlDecode(str: string): string {
    return Buffer.from(str, 'base64url').toString('utf-8');
  }

  /**
   * Signs a payload producing an RFC 7519 standard JSON Web Token using HS256.
   */
  static sign(
    payload: Omit<SinevaJwtClaims, 'iat' | 'exp'>,
    secret: string,
    options: JwtSignOptions = {},
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = options.expiresInSeconds ?? 14 * 24 * 60 * 60; // 14 days default
    const fullPayload: SinevaJwtClaims = Object.assign({}, payload, {
      iat: now,
      exp: now + expiresIn,
    }) as SinevaJwtClaims;

    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(fullPayload));

    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Verifies an HS256 JWT string and returns claims if valid, or null if invalid/expired.
   */
  static verify(token: string, secret: string): SinevaJwtClaims | null {
    if (!token || typeof token !== 'string') {
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    if (!encodedHeader || !encodedPayload || !signature) {
      return null;
    }

    try {
      // 1. Verify algorithm in header
      const header = JSON.parse(this.base64UrlDecode(encodedHeader));
      if (header.alg !== 'HS256') {
        return null;
      }

      // 2. Verify signature timing-safely
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64url');

      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);

      if (
        sigBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
      ) {
        return null;
      }

      // 3. Verify expiration
      const payload: SinevaJwtClaims = JSON.parse(this.base64UrlDecode(encodedPayload));
      const now = Math.floor(Date.now() / 1000);

      if (payload.exp && payload.exp < now) {
        return null; // Expired
      }

      return payload;
    } catch {
      return null;
    }
  }
}
