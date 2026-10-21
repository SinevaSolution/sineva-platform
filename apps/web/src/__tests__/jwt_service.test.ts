import { describe, expect, it } from 'vitest';
import { JwtService, type SinevaJwtClaims } from '@/server/infrastructure/security/jwt_service';

describe('JwtService (HS256 HMAC-SHA256)', () => {
  const secret = 'super-secret-key-that-is-at-least-32-chars-long';
  const sampleClaims: Omit<SinevaJwtClaims, 'iat' | 'exp'> = {
    sub: 'usr-123',
    jti: 'sess-456',
    email: 'budi@example.com',
    name: 'Budi Santoso',
    email_verified: true,
    active_workspace_id: 'ws-789',
    role: 'owner',
    fresh_until: Math.floor(Date.now() / 1000) + 900,
  };

  it('signs and verifies a valid JWT successfully', () => {
    const token = JwtService.sign(sampleClaims, secret, { expiresInSeconds: 3600 });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const verified = JwtService.verify(token, secret);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe(sampleClaims.sub);
    expect(verified?.jti).toBe(sampleClaims.jti);
    expect(verified?.email).toBe(sampleClaims.email);
    expect(verified?.email_verified).toBe(true);
    expect(verified?.role).toBe('owner');
    expect(verified?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects token signed with a different secret', () => {
    const token = JwtService.sign(sampleClaims, secret, { expiresInSeconds: 3600 });
    const wrongSecret = 'another-secret-key-different-hash-at-least-32';
    expect(JwtService.verify(token, wrongSecret)).toBeNull();
  });

  it('rejects tampered token payload', () => {
    const token = JwtService.sign(sampleClaims, secret, { expiresInSeconds: 3600 });
    const [header, , signature] = token.split('.');
    // Tamper payload
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...sampleClaims, role: 'platform_admin' }),
    ).toString('base64url');
    const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

    expect(JwtService.verify(tamperedToken, secret)).toBeNull();
  });

  it('rejects expired token', () => {
    // expired 10 seconds ago
    const token = JwtService.sign(sampleClaims, secret, { expiresInSeconds: -10 });
    expect(JwtService.verify(token, secret)).toBeNull();
  });

  it('rejects malformed token strings', () => {
    expect(JwtService.verify('not.a.valid.token.parts', secret)).toBeNull();
    expect(JwtService.verify('singlepart', secret)).toBeNull();
    expect(JwtService.verify('', secret)).toBeNull();
  });
});
