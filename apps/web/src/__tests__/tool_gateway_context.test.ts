import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GatewayContextVerifier } from '@/server/infrastructure/gateway/gateway_context_verifier';
const pair = generateKeyPairSync('ed25519');
const now = Math.floor(Date.now() / 1000);
const claims = {
  iss: 'sineva-platform',
  aud: 'sineva-ai',
  jti: 'context-1',
  iat: now,
  exp: now + 60,
  tenant_id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  agent_slug: 'sinosales',
  allowed_agents: ['sinosales'],
  role: 'member',
  run_id: 'run_33333333-3333-4333-8333-333333333333',
  request_id: 'request-1',
  allowed_tools: ['gmail_get_message'],
  skill_tools: ['gmail_get_message'],
  trifecta: { private_data: true, untrusted_content: true, send: false },
};
function token(payload: Record<string, unknown> = claims, key = pair.privateKey) {
  const head = Buffer.from(JSON.stringify({ alg: 'EdDSA', kid: 'k1', typ: 'JWT' })).toString(
    'base64url',
  );
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${head}.${body}.${sign(null, Buffer.from(`${head}.${body}`), key).toString('base64url')}`;
}
const verifier = () => new GatewayContextVerifier(async () => new Map([['k1', pair.publicKey]]));
describe('Tool Gateway signed context', () => {
  it('accepts the platform-signed context with bound identity, run and tool scopes', async () => {
    await expect(verifier().verify(token())).resolves.toMatchObject(claims);
  });
  it.each([
    'exp',
    'iat',
    'tenant_id',
    'user_id',
    'agent_slug',
    'run_id',
    'allowed_tools',
    'skill_tools',
    'trifecta',
  ])('rejects a missing %s claim', async (field) => {
    const invalid: Record<string, unknown> = { ...claims };
    delete invalid[field];
    await expect(verifier().verify(token(invalid))).rejects.toMatchObject({ code: 'unauthorized' });
  });
  it.each([
    { exp: now - 100 },
    { iat: now + 100 },
    { exp: now + 3600 },
    { aud: 'other-service' },
    { tenant_id: 'wrong' },
    { allowed_tools: ['*'] },
    { allowed_agents: ['sinohelp'] },
    { trifecta: { private_data: 'false', untrusted_content: false, send: true } },
  ])('rejects invalid claims %j', async (override) => {
    await expect(verifier().verify(token({ ...claims, ...override }))).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });
  it('refuses a forged signature', async () => {
    await expect(
      verifier().verify(token(claims, generateKeyPairSync('ed25519').privateKey)),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });
  it('rejects oversized tokens before looking up keys', async () => {
    await expect(verifier().verify('x'.repeat(16385))).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });
});
