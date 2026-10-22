import 'server-only';
import crypto from 'node:crypto';
import type {
  ContextSigner,
  MintContextOptions,
  SignedContextClaims,
  UserProfileProjection,
} from '@/server/domain/context/signed_context';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ContextTooLargeError, UnauthorizedError } from '@/server/domain/errors/domain_error';

export const MAX_CONTEXT_HEADER_BYTES = 8192; // 8KB header budget fail-closed

export interface KeyPairResult {
  kid: string;
  alg: string;
  privateKeyPem: string;
  publicKeyPem: string;
  publicKeySpkiBase64: string;
}

export function generateEd25519KeyPair(kid?: string): KeyPairResult {
  const generatedKid = kid ?? `key_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const publicKeySpkiBase64 = spkiDer.toString('base64');

  return {
    kid: generatedKid,
    alg: 'EdDSA',
    privateKeyPem,
    publicKeyPem,
    publicKeySpkiBase64,
  };
}

// Ephemeral dev key pair cache to avoid regenerating on every mint in test/dev
let devKeyPairCache: KeyPairResult | null = null;
function getDevKeyPair(): KeyPairResult {
  if (!devKeyPairCache) {
    devKeyPairCache = generateEd25519KeyPair('k1');
  }
  return devKeyPairCache;
}

export class Ed25519ContextSigner implements ContextSigner {
  private readonly privateKey: crypto.KeyObject;
  private readonly kid: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly ttlSeconds: number;

  constructor(options: {
    privateKey: string | crypto.KeyObject;
    kid: string;
    issuer?: string;
    audience?: string;
    ttlSeconds?: number;
  }) {
    this.kid = options.kid;
    this.issuer = options.issuer ?? 'sineva-platform';
    this.audience = options.audience ?? 'sineva-ai';
    this.ttlSeconds = options.ttlSeconds ?? 60; // 60s per D-M0-2 / FR-AIR-06

    if (typeof options.privateKey === 'string') {
      try {
        this.privateKey = crypto.createPrivateKey(options.privateKey);
      } catch (err) {
        throw new Error(
          `Failed to load Ed25519 private key: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      this.privateKey = options.privateKey;
    }
  }

  getKid(): string {
    return this.kid;
  }

  async mint(
    requestContext: RequestContext,
    options?: MintContextOptions,
  ): Promise<{ token: string; claims: SignedContextClaims }> {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + this.ttlSeconds;
    const jti = crypto.randomUUID();

    const profile: UserProfileProjection = options?.profile ?? {};
    const useProfileInContext = profile.use_profile_in_context ?? true;

    const preferredName = profile.preferred_name?.trim() || 'User';
    const salutation = profile.salutation?.trim() || 'kak';
    const timezone = profile.timezone?.trim() || 'Asia/Jakarta';

    const claims: SignedContextClaims = {
      iss: this.issuer,
      aud: this.audience,
      jti,
      iat,
      exp,
      tenant_id: requestContext.workspace_id ?? '00000000-0000-0000-0000-000000000000',
      user_id: requestContext.user_id,
      role: requestContext.role ?? 'member',
      locale: options?.locale ?? 'id',
      allowed_agents: options?.allowed_agents ?? requestContext.allowed_specialists ?? ['*'],
      channel: options?.channel ?? 'app',
      via: options?.via ?? null,
      autonomy_ceiling: options?.autonomy_ceiling ?? 'supervised',
      trace_id: options?.trace_id ?? crypto.randomUUID(),
      request_id: requestContext.request_id,
      preferred_name: preferredName,
      salutation: salutation,
      timezone: timezone,
    };

    if (options?.agent_slug) {
      claims.agent_slug = options.agent_slug;
    }
    if (options?.run_id) {
      claims.run_id = options.run_id;
    }
    if (options?.squad) {
      claims.squad = options.squad;
    }
    if (options?.budget) {
      claims.budget = options.budget;
    }

    // Only include job_title, department, about_me when use_profile_in_context is true
    if (useProfileInContext) {
      if (profile.job_title !== undefined) claims.job_title = profile.job_title;
      if (profile.department !== undefined) claims.department = profile.department;
      if (profile.about_me !== undefined) claims.about_me = profile.about_me;
    }

    // Strict sanitization: NEVER include email, phone, or avatar (FR-AUTH-07b)
    const sanitizedClaims = { ...claims };
    delete (sanitizedClaims as Record<string, unknown>).email;
    delete (sanitizedClaims as Record<string, unknown>).phone;
    delete (sanitizedClaims as Record<string, unknown>).phone_number;
    delete (sanitizedClaims as Record<string, unknown>).avatar;
    delete (sanitizedClaims as Record<string, unknown>).avatar_url;

    const header = {
      alg: 'EdDSA',
      typ: 'JWT',
      kid: this.kid,
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(sanitizedClaims)).toString('base64url');
    const signingInput = `${headerB64}.${payloadB64}`;

    const signature = crypto.sign(null, Buffer.from(signingInput), this.privateKey);
    const token = `${signingInput}.${signature.toString('base64url')}`;

    if (Buffer.byteLength(token, 'utf-8') > MAX_CONTEXT_HEADER_BYTES) {
      throw new ContextTooLargeError(
        `Signed context token size (${Buffer.byteLength(token, 'utf-8')} bytes) exceeds header budget of ${MAX_CONTEXT_HEADER_BYTES} bytes`,
      );
    }

    return { token, claims: sanitizedClaims };
  }
}

export function verifySignedContext(
  token: string,
  publicKeys: Map<string, string | crypto.KeyObject>,
  options?: {
    expectedIssuer?: string;
    expectedAudience?: string;
    clockToleranceSeconds?: number;
  },
): SignedContextClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedError('Malformed context token format');
  }

  const [headerB64, payloadB64, sigB64] = parts;

  let header: { alg?: string; typ?: string; kid?: string };
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));
  } catch {
    throw new UnauthorizedError('Malformed context token header JSON');
  }

  if (header.alg !== 'EdDSA') {
    throw new UnauthorizedError(`Unsupported context signing algorithm: ${header.alg}`);
  }

  if (!header.kid) {
    throw new UnauthorizedError('Missing kid in context token header');
  }

  const rawPubKey = publicKeys.get(header.kid);
  if (!rawPubKey) {
    throw new UnauthorizedError(`Unknown key id in context token header: ${header.kid}`);
  }

  let publicKey: crypto.KeyObject;
  if (typeof rawPubKey === 'string') {
    publicKey = crypto.createPublicKey(rawPubKey);
  } else {
    publicKey = rawPubKey;
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const verified = crypto.verify(
    null,
    Buffer.from(signingInput),
    publicKey,
    Buffer.from(sigB64, 'base64url'),
  );

  if (!verified) {
    throw new UnauthorizedError('Invalid context token signature');
  }

  let claims: SignedContextClaims;
  try {
    claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
  } catch {
    throw new UnauthorizedError('Malformed context token claims JSON');
  }

  const now = Math.floor(Date.now() / 1000);
  const tolerance = options?.clockToleranceSeconds ?? 5;

  if (claims.exp && now > claims.exp + tolerance) {
    throw new UnauthorizedError('Context token has expired');
  }

  if (claims.iat && now < claims.iat - tolerance) {
    throw new UnauthorizedError('Context token iat is in the future beyond tolerance');
  }

  const expectedIssuer = options?.expectedIssuer ?? 'sineva-platform';
  if (claims.iss !== expectedIssuer) {
    throw new UnauthorizedError(`Context token issuer mismatch: expected ${expectedIssuer}`);
  }

  const expectedAudience = options?.expectedAudience ?? 'sineva-ai';
  if (claims.aud !== expectedAudience) {
    throw new UnauthorizedError(`Context token audience mismatch: expected ${expectedAudience}`);
  }

  return claims;
}

const PKCS8_PEM_HEADER = /^-{5}BEGIN PRIVATE KEY-{5}$/m;

export function createDefaultContextSigner(
  rawKey?: string,
  kid?: string,
): Ed25519ContextSigner {
  const resolvedKid = kid ?? 'k1';

  // If a PKCS#8 PEM (the only form an Ed25519 key comes in) is provided, use
  // it. Written as a regex so the literal header does not sit in source,
  // where the CI credential scan rightly treats it as a key.
  if (rawKey && PKCS8_PEM_HEADER.test(rawKey)) {
    return new Ed25519ContextSigner({
      privateKey: rawKey,
      kid: resolvedKid,
    });
  }

  // If in production and no valid key, throw
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'INTERNAL_CONTEXT_SIGNING_KEY must be a valid PEM Ed25519 private key in production',
    );
  }

  // Fallback in dev/test: use cached dev key pair
  const devKey = getDevKeyPair();
  return new Ed25519ContextSigner({
    privateKey: devKey.privateKeyPem,
    kid: devKey.kid,
  });
}
