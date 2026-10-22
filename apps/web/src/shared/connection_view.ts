// Wire shapes of the Connections API (docs/api-spec/connections_endpoints.md).
// Pure types so server routes and the Connected tools UI import the same
// definitions. Nothing here can carry a credential: there is no field for one.
// `server/http/connection_view_contract.ts` keeps what the use cases return
// assignable to these (R-14).

export interface LocalizedTextView {
  en: string;
  id: string;
}

export type ConnectionStatusView = 'connected' | 'partial' | 'needs_reconnect' | 'error' | 'revoked';
export type AccessClassView = 'read' | 'write' | 'admin';
export type ProviderStatusView = 'available' | 'beta' | 'coming_soon';
export type ProviderCategoryView = 'calendar' | 'knowledge' | 'payments' | 'accounting' | 'messaging' | 'marketplace';
export type ConnectorAuthTypeView = 'oauth2_pkce' | 'api_key' | 'hmac' | 'embedded_signup';

export interface ScopeView {
  /** The provider's own scope string. Show it under "Technical details" only. */
  scope_key: string;
  label: LocalizedTextView;
  access_class: AccessClassView;
}

export interface ScopeBundleView {
  bundle_key: string;
  label: LocalizedTextView;
  /** Highest access class among the bundle's scopes. */
  access_class: AccessClassView;
  scopes: ScopeView[];
}

export interface CredentialFieldView {
  /** The key inside `secret` of POST /connections/secret. */
  field_key: string;
  label: LocalizedTextView;
  kind: 'secret' | 'choice';
  choices?: string[];
}

export interface ProviderView {
  provider_id: string;
  display_name: string;
  category: ProviderCategoryView;
  status: ProviderStatusView;
  /** False when the provider is coming soon or its credentials are not configured here. */
  available: boolean;
  unavailable_reason: null | 'coming_soon' | 'credentials_not_configured';
  auth_type: ConnectorAuthTypeView;
  personal_capable: boolean;
  description: LocalizedTextView;
  /** Specialists whose skills use this provider, in roster order. */
  specialists: string[];
  scope_bundles: ScopeBundleView[];
  /** Only for `api_key` providers. */
  credential_fields: CredentialFieldView[];
  can_connect_workspace: boolean;
  can_connect_personal: boolean;
}

/** One row of the access matrix. `write` implies `read`. */
export interface GrantRowView {
  agent_slug: string;
  read: boolean;
  write: boolean;
}

export interface ConnectionView {
  id: string;
  provider_id: string;
  owner_scope: 'workspace' | 'user';
  /** True for the caller's own personal connection. */
  is_mine: boolean;
  status: ConnectionStatusView;
  auth_type: ConnectorAuthTypeView;
  /** "Connected as ...": an email, a workspace name, or a key hint. Never a secret. */
  account_label: string | null;
  scope_bundle: string | null;
  granted_scopes: ScopeView[];
  /** Non-empty only while the status is `partial`. */
  missing_scopes: ScopeView[];
  last_health_at: string | null;
  last_error_code: string | null;
  /** API-key connections: 90 days after the key was last saved. */
  secret_rotation_due_at: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  /** One row per specialist, in roster order. */
  grants: GrantRowView[];
  can: {
    grant: boolean;
    disconnect: boolean;
    reconnect: boolean;
    test: boolean;
    view_activity: boolean;
  };
}

export interface ConnectionTestView {
  result: 'ok' | 'failed';
  status: ConnectionStatusView;
  error_code: string | null;
  checked_at: string;
}

export interface ConnectionDisconnectView {
  id: string;
  status: 'revoked';
  revoked_at: string;
  /** True when the provider confirmed the revoke. False when it could not or does not offer one. */
  provider_revoked: boolean;
}

export interface ConnectionActivityEventView {
  id: string;
  occurred_at: string;
  action: string;
  outcome: 'allowed' | 'denied' | 'error';
  actor_type: 'user' | 'specialist' | 'system' | 'support' | 'mcp_client';
  reason_code: string | null;
}

export interface ConnectionActivityView {
  events: ConnectionActivityEventView[];
  next_cursor: string | null;
}
