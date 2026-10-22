import { describe, expect, it } from 'vitest';
import {
  Ed25519ContextSigner,
  generateEd25519KeyPair,
  verifySignedContext,
  MAX_CONTEXT_HEADER_BYTES,
} from '@/server/infrastructure/security/context_signer';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ContextTooLargeError, UnauthorizedError } from '@/server/domain/errors/domain_error';

describe('Ed25519ContextSigner & Signed Context (WP-M0-27, FR-AIR-06, D-M0-2)', () => {
  const keyPair1 = generateEd25519KeyPair('kid_20261021_01');
  const keyPair2 = generateEd25519KeyPair('kid_20261021_02');

  const signer = new Ed25519ContextSigner({
    privateKey: keyPair1.privateKeyPem,
    kid: keyPair1.kid,
  });

  const baseRequestContext: RequestContext = {
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    workspace_id: '987fcdeb-51a2-43f7-9876-ba0987654321',
    role: 'owner',
    session_id: 'sess_123456',
    request_id: 'req_abcdef',
    allowed_specialists: ['sino', 'sinoinsights'],
  };

  it('mints a compact JWS token with EdDSA algorithm and 60-second expiration (D-M0-2)', async () => {
    const beforeIat = Math.floor(Date.now() / 1000);
    const { token, claims } = await signer.mint(baseRequestContext);
    const afterIat = Math.floor(Date.now() / 1000);

    expect(token).toBeDefined();
    const parts = token.split('.');
    expect(parts.length).toBe(3);

    // Verify JWS header
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
    expect(header.alg).toBe('EdDSA');
    expect(header.typ).toBe('JWT');
    expect(header.kid).toBe('kid_20261021_01');

    // Verify claims
    expect(claims.iss).toBe('sineva-platform');
    expect(claims.aud).toBe('sineva-ai');
    expect(claims.tenant_id).toBe('987fcdeb-51a2-43f7-9876-ba0987654321');
    expect(claims.user_id).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(claims.role).toBe('owner');
    expect(claims.iat).toBeGreaterThanOrEqual(beforeIat);
    expect(claims.iat).toBeLessThanOrEqual(afterIat);
    expect(claims.exp).toBe(claims.iat + 60); // 60s per D-M0-2
    expect(claims.jti).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(claims.channel).toBe('app');
    expect(claims.autonomy_ceiling).toBe('supervised');
  });

  it('carries the run budget claim only when one is given (ADR-0046)', async () => {
    const budget = {
      max_credits: 40,
      max_tokens: null,
      max_tool_calls: 100,
      max_wall_ms: null,
      max_media_jobs: null,
      max_media_cost: null,
    };
    const withBudget = await signer.mint(baseRequestContext, { run_id: 'run-1', budget });
    expect(withBudget.claims.budget).toEqual(budget);
    const publicKeys = new Map<string, string>([[keyPair1.kid, keyPair1.publicKeyPem]]);
    expect(verifySignedContext(withBudget.token, publicKeys).budget).toEqual(budget);

    const withoutBudget = await signer.mint(baseRequestContext, {});
    expect('budget' in withoutBudget.claims).toBe(false);
  });

  it('verifies token successfully with corresponding public key', async () => {
    const { token } = await signer.mint(baseRequestContext, {
      locale: 'id',
      autonomy_ceiling: 'autonomous',
    });

    const publicKeys = new Map<string, string>([[keyPair1.kid, keyPair1.publicKeyPem]]);

    const verifiedClaims = verifySignedContext(token, publicKeys);
    expect(verifiedClaims.tenant_id).toBe(baseRequestContext.workspace_id);
    expect(verifiedClaims.user_id).toBe(baseRequestContext.user_id);
    expect(verifiedClaims.locale).toBe('id');
    expect(verifiedClaims.autonomy_ceiling).toBe('autonomous');
  });

  it('projects user profile correctly per FR-AUTH-07b (when use_profile_in_context is true)', async () => {
    const { claims } = await signer.mint(baseRequestContext, {
      profile: {
        preferred_name: 'Faishal',
        salutation: 'kak',
        timezone: 'Asia/Makassar',
        use_profile_in_context: true,
        job_title: 'Lead Architect',
        department: 'Engineering',
        about_me: 'Likes building reliable systems',
      },
    });

    expect(claims.preferred_name).toBe('Faishal');
    expect(claims.salutation).toBe('kak');
    expect(claims.timezone).toBe('Asia/Makassar');
    expect(claims.job_title).toBe('Lead Architect');
    expect(claims.department).toBe('Engineering');
    expect(claims.about_me).toBe('Likes building reliable systems');
  });

  it('omits optional profile attributes when use_profile_in_context is false (FR-AUTH-07b)', async () => {
    const { claims } = await signer.mint(baseRequestContext, {
      profile: {
        preferred_name: 'Faishal',
        salutation: 'mas',
        timezone: 'Asia/Jakarta',
        use_profile_in_context: false,
        job_title: 'Sensitive Job',
        department: 'Secret Dept',
        about_me: 'Confidential bio',
      },
    });

    expect(claims.preferred_name).toBe('Faishal');
    expect(claims.salutation).toBe('mas');
    expect(claims.timezone).toBe('Asia/Jakarta');
    expect(claims.job_title).toBeUndefined();
    expect(claims.department).toBeUndefined();
    expect(claims.about_me).toBeUndefined();
  });

  it('never leaks email, phone, or avatar in context token (FR-AUTH-07b strict privacy)', async () => {
    // Attempt to pass forbidden fields via casting
    const { claims } = await signer.mint(baseRequestContext, {
      profile: {
        preferred_name: 'Faishal',
        salutation: 'kak',
        timezone: 'Asia/Jakarta',
        use_profile_in_context: true,
        ...({
          email: 'attacker@example.com',
          phone: '+628123456789',
          phone_number: '+628123456789',
          avatar: 'https://example.com/avatar.png',
          avatar_url: 'https://example.com/avatar.png',
        } as unknown as Record<string, unknown>),
      },
    });

    const claimsRecord = claims as unknown as Record<string, unknown>;
    expect(claimsRecord.email).toBeUndefined();
    expect(claimsRecord.phone).toBeUndefined();
    expect(claimsRecord.phone_number).toBeUndefined();
    expect(claimsRecord.avatar).toBeUndefined();
    expect(claimsRecord.avatar_url).toBeUndefined();
  });

  it('fails verification if token signature is tampered', async () => {
    const { token } = await signer.mint(baseRequestContext);
    const parts = token.split('.');
    // Tamper with signature
    const tamperedToken = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -4)}AAAA`;

    const publicKeys = new Map<string, string>([[keyPair1.kid, keyPair1.publicKeyPem]]);

    expect(() => verifySignedContext(tamperedToken, publicKeys)).toThrow(UnauthorizedError);
  });

  it('fails verification if token payload is tampered', async () => {
    const { token } = await signer.mint(baseRequestContext);
    const parts = token.split('.');

    // Tamper with payload by changing tenant_id to a different workspace
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    payload.tenant_id = '00000000-0000-0000-0000-000000000000';
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

    const tamperedToken = `${parts[0]}.${tamperedPayloadB64}.${parts[2]}`;
    const publicKeys = new Map<string, string>([[keyPair1.kid, keyPair1.publicKeyPem]]);

    expect(() => verifySignedContext(tamperedToken, publicKeys)).toThrow(UnauthorizedError);
  });

  it('fails closed and throws ContextTooLargeError when token exceeds 8KB budget (WP-M0-27 task 3)', async () => {
    // Generate large text exceeding 8KB
    const hugeAboutMe = 'A'.repeat(MAX_CONTEXT_HEADER_BYTES + 500);

    await expect(
      signer.mint(baseRequestContext, {
        profile: {
          preferred_name: 'Faishal',
          salutation: 'kak',
          timezone: 'Asia/Jakarta',
          use_profile_in_context: true,
          about_me: hugeAboutMe,
        },
      }),
    ).rejects.toThrow(ContextTooLargeError);
  });

  it('supports two valid keys during key rotation (FR-SEC-02)', async () => {
    const signer2 = new Ed25519ContextSigner({
      privateKey: keyPair2.privateKeyPem,
      kid: keyPair2.kid,
    });

    const publicKeys = new Map<string, string>([
      [keyPair1.kid, keyPair1.publicKeyPem],
      [keyPair2.kid, keyPair2.publicKeyPem],
    ]);

    const { token: token1 } = await signer.mint(baseRequestContext);
    const { token: token2 } = await signer2.mint(baseRequestContext);

    const verified1 = verifySignedContext(token1, publicKeys);
    const verified2 = verifySignedContext(token2, publicKeys);

    expect(verified1.jti).toBeDefined();
    expect(verified2.jti).toBeDefined();
    expect(verified1.user_id).toBe(baseRequestContext.user_id);
    expect(verified2.user_id).toBe(baseRequestContext.user_id);
  });

  it('rejects token when kid is not found in public keys map', async () => {
    const { token } = await signer.mint(baseRequestContext);
    const unknownKeys = new Map<string, string>([
      ['unknown_kid', keyPair2.publicKeyPem],
    ]);

    expect(() => verifySignedContext(token, unknownKeys)).toThrow(/Unknown key id/);
  });
});
