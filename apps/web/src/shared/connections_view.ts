// What the Connected tools screens read. These are UI-facing views, not the
// wire: `client/lib/connections_api.ts` is the only module that knows the JSON
// of `/api/v1/workspaces/{workspace_id}/connections` (documented in
// docs/api-spec/connections_endpoints.md of the backend) and maps it into the
// types below. A change on the wire is reconciled there and here, nowhere else.

/** Categories a provider can have. The filter chips show the first five. */
export const FILTER_CATEGORIES = ['calendar', 'docs', 'payments', 'accounting', 'messaging'] as const;
export type FilterCategory = (typeof FILTER_CATEGORIES)[number];
export type ProviderCategory = FilterCategory | 'marketplace';

/** How the person connects: sign in at the provider, or paste credentials. */
export type ProviderAuthType = 'oauth' | 'api_key' | 'hmac' | 'embedded_signup';

/**
 * What the server says about a provider.
 * - `credentials_missing`: Sineva's own app for it is not configured on this server yet.
 * - `paused`: switched off by Sineva (reserved for the kill switch; the API does not send it yet).
 */
export type ProviderAvailability = 'available' | 'beta' | 'coming_soon' | 'credentials_missing' | 'paused';

export type AccessClass = 'read' | 'write' | 'admin';

export interface ScopeView {
  /** Raw provider scope string. Shown only under "Technical details". */
  key: string;
  label_en: string;
  label_id: string;
  access_class: AccessClass;
}

/**
 * One tier of access asked for in a single sign-in. Tiers are alternatives, not
 * additions: the read tier has the read scopes, the write tier has everything
 * the write tier needs (usually read and write). Start sends exactly one key.
 */
export interface ScopeBundleView {
  key: string;
  access_class: AccessClass;
  scopes: ScopeView[];
}

/** One input of the key form. `choice` fields (sandbox or production) are radio cards. */
export interface CredentialFieldView {
  field_key: string;
  label_en: string;
  label_id: string;
  kind: 'secret' | 'choice';
  choices: string[];
}

export interface ProviderView {
  slug: string;
  name: string;
  /** Short label for buttons ("Jurnal"). The API has none yet, so this is null and the name is used. */
  short_name: string | null;
  category: ProviderCategory;
  auth_type: ProviderAuthType;
  availability: ProviderAvailability;
  /** Plain-words purpose in both languages, or null when the server sent none. */
  description_en: string | null;
  description_id: string | null;
  /** The server allows this person to create a workspace connection / their own personal one. */
  can_connect_workspace: boolean;
  can_connect_personal: boolean;
  /** Key providers: the inputs of the form. Empty for sign-in providers. */
  credential_fields: CredentialFieldView[];
  /** Payment providers: the key can do more than Sineva will ever do. */
  read_only_notice: boolean;
  /** A write tier exists (false for payments and read-only accounting). */
  write_supported: boolean;
  bundles: ScopeBundleView[];
  /** Specialists whose built-in skills use this provider; they get read by default. */
  specialists: string[];
}

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'partial'
  | 'needs_reconnect'
  | 'error'
  | 'revoked';

export type ConnectionOwnerScope = 'workspace' | 'user';

export type AccessLevel = 'none' | 'read' | 'write';

export interface GrantView {
  agent_slug: string;
  access_level: AccessLevel;
}

/** What the signed-in person may do with this connection, decided by the server. */
export interface ConnectionCan {
  grant: boolean;
  disconnect: boolean;
  reconnect: boolean;
  test: boolean;
  view_activity: boolean;
}

export interface ConnectionView {
  id: string;
  provider_slug: string;
  /** Joined from the catalog by the client module, so banners need no second call. */
  provider_name: string;
  provider_short_name: string | null;
  owner_scope: ConnectionOwnerScope;
  /** True for a personal connection that belongs to the signed-in person. */
  owned_by_me: boolean;
  status: ConnectionStatus;
  /** "Connected as ..." (email, shop or merchant name). Never a secret. */
  account_label: string | null;
  /** The API does not say who connected it yet; the row is hidden while this is null. */
  connected_by_name: string | null;
  connected_at: string | null;
  last_health_at: string | null;
  /** Machine code of the last failure, for support. Never shown raw. */
  last_error_code: string | null;
  granted_scopes: ScopeView[];
  /** Scopes the person unticked or the provider did not give (status `partial`). */
  missing_scopes: ScopeView[];
  grants: GrantView[];
  /** Key connections: when Sineva suggests replacing the key. Never a fragment of the key. */
  secret_rotation_due_at: string | null;
  revoked_at: string | null;
  can: ConnectionCan;
}

/** Audit events of one connection, in the fields the list shows. */
export interface ActivityView {
  id: string;
  occurred_at: string;
  /** Audit action, e.g. `connection.grant_changed`. The model turns it into words. */
  action: string;
  /** Raw outcome when the server sends one; only values the list knows get a badge. */
  outcome: string | null;
}

export interface ActivityPageView {
  items: ActivityView[];
  next_cursor: string | null;
}

// Requests, as the screens build them.

export interface StartOAuthRequest {
  provider: string;
  owner_scope: ConnectionOwnerScope;
  /** Key of the one tier asked for. */
  bundle_key: string;
  /** Same-site path the server redirects to after the callback. */
  return_to: string;
}

export interface SaveSecretRequest {
  provider: string;
  /** field_key to value, including `choice` fields such as the environment. */
  secret: Record<string, string>;
  owner_scope: ConnectionOwnerScope;
  /** Set to replace the key of an existing connection. */
  connection_id: string | null;
}

export interface TestConnectionView {
  ok: boolean;
  checked_at: string;
  status: ConnectionStatus;
}

export interface DisconnectView {
  /** False: the provider could not be asked to remove access (best effort). */
  provider_revoked: boolean;
}
