import type { OwnerScope } from './connection';

/** One authorization attempt. The state itself is never stored, only its hash. */
export interface OAuthFlowEntity {
  id: string;
  workspace_id: string;
  user_id: string;
  provider_id: string;
  /** Set when the flow reconnects or widens an existing connection. */
  connection_id: string | null;
  owner_scope: OwnerScope;
  scope_bundle: string;
  scopes: string[];
  state_hash: string;
  nonce: string;
  redirect_uri: string;
  issuer: string;
  session_hash: string;
  return_to: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

export type NewOAuthFlow = Omit<OAuthFlowEntity, 'id' | 'consumed_at' | 'created_at'>;

/** How long a person has to finish at the provider (FR-CONN-06). */
export const OAUTH_FLOW_TTL_MS = 10 * 60_000;

/** Result codes the callback redirect carries (`connection_result`). Documented in connections_endpoints.md. */
export type OAuthResultCode =
  | 'connected'
  | 'partial'
  | 'reconnected'
  | 'denied'
  | 'duplicate_account'
  | 'different_account'
  | 'expired'
  | 'error';
