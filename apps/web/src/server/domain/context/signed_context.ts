import type { UserRole } from '@/server/domain/entities/user';
import type { RequestContext } from './request_context';

export interface UserProfileProjection {
  preferred_name?: string | null;
  salutation?: string | null;
  timezone?: string;
  use_profile_in_context?: boolean;
  job_title?: string | null;
  department?: string | null;
  about_me?: string | null;
}

export interface SignedContextClaims {
  // Standard JWS / JWT claims
  iss: string;
  aud: string;
  jti: string;
  iat: number;
  exp: number;

  // Identity and scope claims (FR-AIR-06 & D-M0-2)
  tenant_id: string;
  user_id: string;
  role: UserRole;
  locale: string;
  allowed_agents: string[];
  channel: 'app' | 'mcp';
  via: string | null;
  autonomy_ceiling: string;
  trace_id: string;
  request_id: string;

  // Profile projections (FR-AUTH-07b)
  preferred_name: string;
  salutation: string;
  timezone: string;

  // Conditional profile attributes (only if use_profile_in_context is true)
  job_title?: string | null;
  department?: string | null;
  about_me?: string | null;

  // Additional optional claims reserved for subsequent milestones
  agent_slug?: string | null;
  run_id?: string | null;
}

export interface MintContextOptions {
  agent_slug?: string | null;
  run_id?: string | null;
  channel?: 'app' | 'mcp';
  via?: string | null;
  autonomy_ceiling?: string;
  locale?: string;
  profile?: UserProfileProjection;
  allowed_agents?: string[];
  trace_id?: string;
}

export interface ContextSigner {
  mint(
    requestContext: RequestContext,
    options?: MintContextOptions,
  ): Promise<{ token: string; claims: SignedContextClaims }>;
}
