// Connector manifests and the driver interface (ADR-0037). A provider is data:
// who it is, how it authenticates, which scopes it has, which hosts it may be
// called on and which actions it exposes. Drivers carry the behavior.

import type { ZodTypeAny } from 'zod';
import type { ConnectorAuthType } from './connection';

export interface LocalizedText {
  en: string;
  id: string;
}

export type AccessClass = 'read' | 'write' | 'admin';
export const ACCESS_CLASSES: readonly AccessClass[] = ['read', 'write', 'admin'];

export type ProviderStatus = 'available' | 'beta' | 'coming_soon';
export type ProviderCategory = 'calendar' | 'knowledge' | 'payments' | 'accounting' | 'messaging' | 'marketplace';

/**
 * What an action does to the outside world. `pay` exists as a class so the
 * registry can name and reject it, but it is deliberately not assignable
 * (`AssignableSideEffect`): no v1.0 action may move money (FR-SKILL-08,
 * product guardrail: SinoFinance never moves money).
 */
export type SideEffect = 'read' | 'draft' | 'write_external' | 'send' | 'publish' | 'pay';
export type AssignableSideEffect = Exclude<SideEffect, 'pay'>;
export const ASSIGNABLE_SIDE_EFFECTS: readonly AssignableSideEffect[] = [
  'read',
  'draft',
  'write_external',
  'send',
  'publish',
];

export interface ScopeDefinition {
  /** The provider's own scope string, shown only under "Technical details". */
  scope_key: string;
  label: LocalizedText;
  access_class: AccessClass;
}

/** A named set of scopes the user can pick; only the chosen bundle is requested (FR-CONN-08). */
export interface ScopeBundle {
  bundle_key: string;
  label: LocalizedText;
  scope_keys: string[];
}

export interface EgressRule {
  /** Exact host name. No wildcards, so a provider cannot be pointed at another host. */
  host: string;
  path_prefixes: string[];
}

/** Names of provider credentials in the environment config (`getEnvConfig()` keys), never the values. */
export interface ProviderCredentialKeys {
  client_id: string;
  client_secret: string;
}

export interface OAuthConfig {
  authorize_url: string;
  token_url: string;
  revoke_url?: string;
  /** The `iss` the provider answers with (RFC 9207). Checked only when the callback carries one. */
  issuer: string;
  pkce: boolean;
  scope_separator: ' ' | ',';
  /** False when the provider has no scope strings (Notion): the bundle's keys are Sineva's own names and are not sent. */
  send_scope_param: boolean;
  /** Provider-specific authorization parameters (offline access, forced consent). Recalled until verified (OQ-CONN-8). */
  extra_authorize_params: Record<string, string>;
  client_auth: 'body' | 'basic';
  token_request_format: 'form' | 'json';
  /** `non_expiring` providers return no expiry and no refresh token. */
  token_lifetime: 'expiring' | 'non_expiring';
  /** True when the token response lists the granted scopes. False means granted equals requested. */
  scopes_in_token_response: boolean;
  /** Where the account identity comes from after the exchange. */
  whoami:
    | { source: 'endpoint'; url: string; account_id_path: string; account_label_path: string; headers?: Record<string, string> }
    | { source: 'token_response'; account_id_path: string; account_label_path: string };
  credential_keys: ProviderCredentialKeys;
}

export interface CredentialField {
  field_key: string;
  label: LocalizedText;
  kind: 'secret' | 'choice';
  choices?: string[];
}

export interface ApiKeyConfig {
  fields: CredentialField[];
  /**
   * The cheapest authenticated call that tells a good key from a bad one.
   * `accept_statuses` are the HTTP statuses that mean "the key was accepted"
   * (a status lookup for an unknown order answers 404 for a valid key).
   */
  test: {
    method: 'GET';
    /** `{environment}` is replaced by the chosen value of the `environment` field when the provider has one. */
    url_by_environment: Record<string, string>;
    auth: 'basic_user';
    accept_statuses: number[];
    invalid_statuses: number[];
    insufficient_statuses: number[];
  };
}

export interface ActionDefinition {
  /** `^[a-z][a-z0-9_]*$`, for example `google_calendar_list_events`. Dotted ids are invalid. */
  action_id: string;
  provider_id: string;
  side_effect: AssignableSideEffect;
  /** Scope keys of the provider that this action needs. */
  scopes: string[];
  risk_level: 'low' | 'medium' | 'high';
  reversible: boolean;
  autonomy_eligible: boolean;
  guardrail_locked: boolean;
  /** The sentence an approval shows, with `{name}` style placeholders. Written by the platform, never by a model. */
  approval_sentence_template: LocalizedText;
  input_schema: ZodTypeAny;
  output_schema: ZodTypeAny;
  display_card_type: string | null;
  /** i18n key of the activity line ("Reading your calendar"). */
  activity_label_key: string;
  max_response_bytes: number;
}

export interface ProviderManifest {
  /** `^[a-z][a-z0-9_]*$`. */
  provider_id: string;
  display_name: string;
  category: ProviderCategory;
  status: ProviderStatus;
  auth_type: ConnectorAuthType;
  personal_capable: boolean;
  description: LocalizedText;
  scopes: ScopeDefinition[];
  bundles: ScopeBundle[];
  oauth?: OAuthConfig;
  api_key?: ApiKeyConfig;
  egress: EgressRule[];
  actions: ActionDefinition[];
}

export interface TokenSet {
  access_token: string;
  refresh_token: string | null;
  /** Seconds. Null when the provider issues non-expiring tokens. */
  expires_in: number | null;
  /** Granted scope strings when the provider reports them, else null. */
  scopes: string[] | null;
  token_type: string;
  /** The raw account fields of the token response, for providers that identify the account there. */
  account: Record<string, unknown> | null;
}

export interface AccountIdentity {
  external_account_id: string | null;
  account_label: string | null;
}

/** An OAuth endpoint refused the request. `invalid_grant` is the one callers must treat as terminal. */
export class ConnectorAuthError extends Error {
  constructor(
    readonly code: 'invalid_grant' | 'invalid_client' | 'access_denied' | 'invalid_request' | 'unknown',
    readonly status: number,
  ) {
    super(code);
    this.name = 'ConnectorAuthError';
  }
}

/** The provider could not be reached or answered 5xx. Safe to retry. */
export class ConnectorUnreachableError extends Error {
  constructor(readonly status: number | null) {
    super(status === null ? 'unreachable' : `upstream_${status}`);
    this.name = 'ConnectorUnreachableError';
  }
}

export class ConnectorResponseTooLargeError extends ConnectorUnreachableError {
  constructor(readonly limit_bytes: number) { super(null); this.name = 'ConnectorResponseTooLargeError'; }
}

export class ConnectorUnsupportedError extends Error {
  constructor(operation: string) {
    super(`unsupported_${operation}`);
    this.name = 'ConnectorUnsupportedError';
  }
}

export interface AuthorizeInput {
  redirect_uri: string;
  state: string;
  scopes: string[];
  client_id: string;
  code_challenge?: string;
  nonce?: string;
}

/**
 * One provider's behavior behind a fixed shape (ADR-0037). The OAuth methods
 * throw `ConnectorUnsupportedError` on an API-key driver and the other way
 * around. A driver never decides when to run: the OAuth service, the refresh
 * worker and the gateway own that, and they own the credentials and the network
 * (the HTTP port enforces the egress allowlist).
 */
export interface ConnectorDriver {
  readonly provider_id: string;
  readonly auth_type: ConnectorAuthType;
  authorize(input: AuthorizeInput): { url: string };
  exchange(input: { code: string; redirect_uri: string; code_verifier?: string }): Promise<TokenSet>;
  refresh(input: { refresh_token: string }): Promise<TokenSet>;
  /** Best effort at the provider. Resolves true when the provider confirmed, false when it could not or does not support it. */
  revoke(input: { token: string; token_type: 'access_token' | 'refresh_token' }): Promise<boolean>;
  /** OAuth: identity of the account behind an access token. API key: the connection test (`credentials` are the pasted fields). */
  whoami(input: { access_token?: string; token_account?: Record<string, unknown> | null; credentials?: Record<string, string> }): Promise<AccountIdentity>;
  actions(): ActionDefinition[];
}

export interface ConnectorHttpRequest {
  provider_id: string;
  method: 'GET' | 'POST' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface ConnectorHttpResponse {
  status: number;
  body: string;
}

/**
 * The only way a driver reaches the network. The adapter checks the provider's
 * egress allowlist, applies a timeout and a size cap, and throws
 * `ConnectorUnreachableError` for network failures. The request and response
 * bodies carry credentials, so nothing here logs them.
 */
export interface ConnectorHttpClient {
  request(request: ConnectorHttpRequest): Promise<ConnectorHttpResponse>;
}
