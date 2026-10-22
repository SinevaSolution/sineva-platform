import 'server-only';
import { createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';
import type {
  GatewayContext,
  GatewayPublicKeys,
  ToolContextVerifier,
} from '@/server/domain/toolgateway/gateway_context';
import { ToolGatewayError } from '@/server/domain/toolgateway/tool_executor';

const toolNames = z
  .array(
    z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(128),
  )
  .max(200);
export const gatewayContextSchema = z.object({
  iss: z.literal('sineva-platform'),
  aud: z.literal('sineva-ai'),
  jti: z.string().min(1).max(128),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
  agent_slug: z.string().regex(/^[a-z][a-z0-9_]*$/),
  allowed_agents: z.array(z.string()).max(30),
  run_id: z.string().regex(/^run_[0-9a-f-]{36}$/),
  request_id: z.string().min(1).max(200),
  locale: z.string().max(20).default('id'),
  allowed_tools: toolNames,
  skill_tools: toolNames,
  trifecta: z
    .object({ private_data: z.boolean(), untrusted_content: z.boolean(), send: z.boolean() })
    .strict(),
});

/** Verifies the original platform token forwarded by sineva-ai; it grants no new scope. */
export class GatewayContextVerifier implements ToolContextVerifier {
  constructor(private readonly keys: GatewayPublicKeys) {}

  async verify(token: string): Promise<GatewayContext> {
    const refuse = () => new ToolGatewayError('unauthorized', 401);
    if (
      Buffer.byteLength(token) > 16_384 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
    )
      throw refuse();
    const [head, body, signature] = token.split('.') as [string, string, string];
    const keys = await this.keys();
    try {
      const header: unknown = JSON.parse(Buffer.from(head, 'base64url').toString());
      const parsedHeader = z
        .object({ alg: z.literal('EdDSA'), typ: z.literal('JWT'), kid: z.string().min(1).max(128) })
        .strict()
        .parse(header);
      const rawKey = keys.get(parsedHeader.kid);
      if (!rawKey) throw refuse();
      const key = typeof rawKey === 'string' ? createPublicKey(rawKey) : rawKey;
      if (
        key.asymmetricKeyType !== 'ed25519' ||
        !verify(null, Buffer.from(`${head}.${body}`), key, Buffer.from(signature, 'base64url'))
      )
        throw refuse();
      const claims = gatewayContextSchema.parse(
        JSON.parse(Buffer.from(body, 'base64url').toString()),
      );
      const now = Math.floor(Date.now() / 1000);
      if (
        claims.exp <= now ||
        claims.iat > now + 5 ||
        claims.exp <= claims.iat ||
        claims.exp - claims.iat > 60
      )
        throw refuse();
      if (
        !claims.allowed_agents.includes('*') &&
        !claims.allowed_agents.includes(claims.agent_slug)
      )
        throw refuse();
      return claims;
    } catch {
      throw refuse();
    }
  }
}
