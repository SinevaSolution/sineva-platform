import type { KeyObject } from 'node:crypto';
import type { UserRole } from '@/server/domain/entities/user';

export interface GatewayContext {
  iss: string;
  aud: string;
  jti: string;
  iat: number;
  exp: number;
  tenant_id: string;
  user_id: string;
  role: UserRole;
  agent_slug: string;
  allowed_agents: string[];
  run_id: string;
  request_id: string;
  locale: string;
  /** Minted by the platform from the specialist ceiling and selected skill. */
  allowed_tools: string[];
  skill_tools: string[];
  trifecta: { private_data: boolean; untrusted_content: boolean; send: boolean };
}

export interface ToolContextVerifier {
  verify(token: string): Promise<GatewayContext>;
}

export type GatewayPublicKeys = () => Promise<Map<string, string | KeyObject>>;
