import 'server-only';
import crypto from 'node:crypto';
import { OAUTH_INTENTS, type OAuthIntent } from '@/server/domain/auth/oauth_intent';
import { ValidationError } from '@/server/domain/errors/domain_error';

export interface OAuthStatePayload {
  state: string;
  codeVerifier: string;
  provider: string;
  returnTo?: string;
  createdAt: number;
  intent: OAuthIntent;
  userId?: string;
}

export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function generateOAuthState(
  provider: string,
  authSecret: string,
  returnTo?: string,
  binding: { intent?: OAuthIntent; userId?: string } = {},
): { state: string; codeVerifier: string; codeChallenge: string; signedCookieValue: string } {
  const { codeVerifier, codeChallenge } = generatePkce();
  const state = crypto.randomBytes(24).toString('base64url');

  const payload: OAuthStatePayload = {
    state,
    codeVerifier,
    provider,
    returnTo,
    createdAt: Date.now(),
    intent: binding.intent ?? 'sign_in',
    userId: binding.userId,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', authSecret)
    .update(payloadB64)
    .digest('base64url');

  const signedCookieValue = `${payloadB64}.${sig}`;

  return {
    state,
    codeVerifier,
    codeChallenge,
    signedCookieValue,
  };
}

export function verifyOAuthState(
  signedCookieValue: string | undefined,
  expectedState: string,
  authSecret: string,
  maxAgeMs: number = 10 * 60 * 1000, // 10 minutes
): OAuthStatePayload {
  if (!signedCookieValue) {
    throw new ValidationError('OAuth state cookie is missing', [
      { code: 'missing_oauth_state', field: 'state', detail: 'State cookie missing or expired' },
    ]);
  }

  const parts = signedCookieValue.split('.');
  if (parts.length !== 2) {
    throw new ValidationError('Malformed OAuth state cookie', [
      { code: 'malformed_oauth_state', field: 'state', detail: 'Invalid state format' },
    ]);
  }

  const [payloadB64, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', authSecret)
    .update(payloadB64)
    .digest('base64url');

  // Constant-time signature verification
  const sigBuf = Buffer.from(sig);
  const expectedSigBuf = Buffer.from(expectedSig);
  if (
    sigBuf.length !== expectedSigBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedSigBuf)
  ) {
    throw new ValidationError('Invalid OAuth state signature', [
      { code: 'invalid_oauth_state_signature', field: 'state', detail: 'Tampered state cookie' },
    ]);
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
  } catch {
    throw new ValidationError('Malformed OAuth state JSON', [
      { code: 'malformed_oauth_state_json', field: 'state', detail: 'Corrupt state payload' },
    ]);
  }

  // Check state match
  if (payload.state !== expectedState) {
    throw new ValidationError('OAuth state parameter mismatch', [
      { code: 'oauth_state_mismatch', field: 'state', detail: 'State does not match session' },
    ]);
  }

  // Check expiration
  if (Date.now() - payload.createdAt > maxAgeMs) {
    throw new ValidationError('OAuth session has expired. Please try signing in again.', [
      { code: 'oauth_state_expired', field: 'state', detail: 'State expired' },
    ]);
  }

  // A cookie issued before intents existed has no field: it was a sign-in.
  if (!OAUTH_INTENTS.includes(payload.intent)) {
    payload = { ...payload, intent: 'sign_in' };
  }

  return payload;
}
