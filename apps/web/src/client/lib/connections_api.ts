// The only module that talks to the Connections API. Screens receive a
// `ConnectionsApi` (or build the default one) and never call `fetch`, so tests
// pass a fake and a change in the backend shapes is reconciled here and in
// `@/shared/connections_view`.
//
// The wire types below follow docs/api-spec/connections_endpoints.md of the
// backend (version 1.0.0). They are mapped into the UI views on the way in, so
// the screens never see `provider_id`, `read`/`write` booleans or localized
// text objects.

import type {
  AccessLevel,
  ActivityPageView,
  ConnectionStatus,
  ConnectionView,
  DisconnectView,
  GrantView,
  ProviderAuthType,
  ProviderCategory,
  ProviderView,
  SaveSecretRequest,
  ScopeView,
  StartOAuthRequest,
  TestConnectionView,
} from '@/shared/connections_view';
import { apiRequest } from './api';

// Wire shapes (only the fields the UI reads).

interface LocalizedText {
  en: string;
  id: string;
}

interface WireScope {
  scope_key: string;
  label: LocalizedText;
  access_class: 'read' | 'write' | 'admin';
}

export interface WireProvider {
  provider_id: string;
  display_name: string;
  category: string;
  status: 'available' | 'beta' | 'coming_soon';
  available: boolean;
  unavailable_reason: null | 'coming_soon' | 'credentials_not_configured';
  auth_type: string;
  description: LocalizedText | null;
  specialists: string[];
  scope_bundles: Array<{
    bundle_key: string;
    access_class: 'read' | 'write' | 'admin';
    scopes: WireScope[];
  }>;
  credential_fields: Array<{
    field_key: string;
    label: LocalizedText;
    kind: 'secret' | 'choice';
    choices?: string[];
  }>;
  can_connect_workspace: boolean;
  can_connect_personal: boolean;
}

interface WireGrant {
  agent_slug: string;
  read: boolean;
  write: boolean;
}

export interface WireConnection {
  id: string;
  provider_id: string;
  owner_scope: 'workspace' | 'user';
  is_mine: boolean;
  status: ConnectionStatus;
  account_label: string | null;
  granted_scopes: WireScope[];
  missing_scopes: WireScope[];
  last_health_at: string | null;
  last_error_code: string | null;
  secret_rotation_due_at: string | null;
  created_at: string;
  revoked_at: string | null;
  grants: WireGrant[];
  can: {
    grant: boolean;
    disconnect: boolean;
    reconnect: boolean;
    test: boolean;
    view_activity: boolean;
  };
}

// Mapping.

// "knowledge" is what the catalog calls Notion and friends; the screens say Docs.
const CATEGORIES: Record<string, ProviderCategory> = {
  calendar: 'calendar',
  knowledge: 'docs',
  payments: 'payments',
  accounting: 'accounting',
  messaging: 'messaging',
  marketplace: 'marketplace',
};

const AUTH_TYPES: Record<string, ProviderAuthType> = {
  oauth2_pkce: 'oauth',
  api_key: 'api_key',
  hmac: 'hmac',
  embedded_signup: 'embedded_signup',
};

const mapScope = (s: WireScope): ScopeView => ({
  key: s.scope_key,
  label_en: s.label.en,
  label_id: s.label.id,
  access_class: s.access_class,
});

export function mapProvider(p: WireProvider): ProviderView {
  const bundles = p.scope_bundles.map((b) => ({
    key: b.bundle_key,
    access_class: b.access_class,
    scopes: b.scopes.map(mapScope),
  }));
  const category = CATEGORIES[p.category] ?? 'marketplace';
  const writeSupported = bundles.some((b) => b.access_class === 'write');
  let availability: ProviderView['availability'] = 'available';
  if (p.status === 'coming_soon' || p.unavailable_reason === 'coming_soon') availability = 'coming_soon';
  else if (p.unavailable_reason === 'credentials_not_configured' || !p.available) availability = 'credentials_missing';
  else if (p.status === 'beta') availability = 'beta';
  return {
    slug: p.provider_id,
    name: p.display_name,
    short_name: null,
    category,
    // An auth type this client does not know cannot be connected from here.
    auth_type: AUTH_TYPES[p.auth_type] ?? 'embedded_signup',
    availability,
    description_en: p.description?.en ?? null,
    description_id: p.description?.id ?? null,
    can_connect_workspace: p.can_connect_workspace,
    can_connect_personal: p.can_connect_personal,
    credential_fields: p.credential_fields.map((f) => ({
      field_key: f.field_key,
      label_en: f.label.en,
      label_id: f.label.id,
      kind: f.kind,
      choices: f.choices ?? [],
    })),
    read_only_notice: category === 'payments' && !writeSupported,
    write_supported: writeSupported,
    bundles,
    specialists: p.specialists,
  };
}

const levelOf = (g: WireGrant): AccessLevel => (g.write ? 'write' : g.read ? 'read' : 'none');

export function mapGrants(grants: WireGrant[]): GrantView[] {
  return grants.map((g) => ({ agent_slug: g.agent_slug, access_level: levelOf(g) }));
}

/** Write implies read on the wire as well; `none` is a row with both false. */
export function grantsToWire(grants: GrantView[]): WireGrant[] {
  return grants.map((g) => ({
    agent_slug: g.agent_slug,
    read: g.access_level !== 'none',
    write: g.access_level === 'write',
  }));
}

export function mapConnection(c: WireConnection, provider: ProviderView | undefined): ConnectionView {
  return {
    id: c.id,
    provider_slug: c.provider_id,
    provider_name: provider?.name ?? c.provider_id,
    provider_short_name: provider?.short_name ?? null,
    owner_scope: c.owner_scope,
    owned_by_me: c.is_mine,
    status: c.status,
    account_label: c.account_label,
    connected_by_name: null,
    connected_at: c.created_at,
    last_health_at: c.last_health_at,
    last_error_code: c.last_error_code,
    granted_scopes: c.granted_scopes.map(mapScope),
    missing_scopes: c.missing_scopes.map(mapScope),
    grants: mapGrants(c.grants),
    secret_rotation_due_at: c.secret_rotation_due_at,
    revoked_at: c.revoked_at,
    can: c.can,
  };
}

// Client.

export interface ConnectionsApi {
  listProviders(): Promise<ProviderView[]>;
  listConnections(): Promise<ConnectionView[]>;
  getConnection(id: string): Promise<ConnectionView>;
  /** Returns the provider's authorization URL; the browser then leaves the app. */
  startOAuth(request: StartOAuthRequest): Promise<string>;
  /**
   * Connects a key provider, or replaces the key of `connection_id`. The server
   * tests the key with the provider first and stores nothing when the test
   * fails, so there is no separate dry run. The key travels in the body only.
   */
  saveSecret(request: SaveSecretRequest): Promise<ConnectionView>;
  /** `bundle_key` keeps or raises the access tier; omit it to keep what was granted. */
  reconnect(id: string, request: { return_to: string; bundle_key?: string }): Promise<string>;
  testConnection(id: string): Promise<TestConnectionView>;
  /** Replaces the access matrix and returns the saved one. */
  updateGrants(id: string, grants: GrantView[]): Promise<GrantView[]>;
  disconnect(id: string): Promise<DisconnectView>;
  listActivity(id: string, cursor?: string): Promise<ActivityPageView>;
}

/** Providers are read by almost every call (names for connections); one read serves a burst. */
const PROVIDER_REUSE_MS = 5_000;

export function createConnectionsApi(workspaceId: string): ConnectionsApi {
  const base = `/api/v1/workspaces/${workspaceId}/connections`;
  const one = (id: string) => `${base}/${encodeURIComponent(id)}`;

  let cache: { at: number; promise: Promise<ProviderView[]> } | null = null;
  const providers = (): Promise<ProviderView[]> => {
    if (cache && Date.now() - cache.at < PROVIDER_REUSE_MS) return cache.promise;
    const promise = apiRequest<{ providers: WireProvider[] }>(`${base}/providers`).then((d) =>
      d.providers.map(mapProvider),
    );
    cache = { at: Date.now(), promise };
    // A failed read must not be served again for the next five seconds.
    promise.catch(() => {
      if (cache?.promise === promise) cache = null;
    });
    return promise;
  };
  const named = (list: ProviderView[]) => new Map(list.map((p) => [p.slug, p]));

  return {
    listProviders: providers,
    async listConnections() {
      const [data, list] = await Promise.all([
        apiRequest<{ connections: WireConnection[] }>(base),
        providers(),
      ]);
      const bySlug = named(list);
      return data.connections.map((c) => mapConnection(c, bySlug.get(c.provider_id)));
    },
    async getConnection(id) {
      const [data, list] = await Promise.all([
        apiRequest<{ connection: WireConnection }>(one(id)),
        providers(),
      ]);
      return mapConnection(data.connection, named(list).get(data.connection.provider_id));
    },
    async startOAuth(request) {
      const data = await apiRequest<{ authorization_url: string }>(`${base}/oauth/start`, {
        method: 'POST',
        body: {
          provider_id: request.provider,
          scope_bundle: request.bundle_key,
          owner_scope: request.owner_scope,
          return_to: request.return_to,
        },
      });
      return data.authorization_url;
    },
    async saveSecret(request) {
      // The key is tested and stored (or refused) by this one call; the catalog
      // is read only after it worked, so a failure costs nothing else.
      const data = await apiRequest<{ connection: WireConnection }>(`${base}/secret`, {
        method: 'POST',
        body: {
          provider_id: request.provider,
          owner_scope: request.owner_scope,
          ...(request.connection_id ? { connection_id: request.connection_id } : {}),
          secret: request.secret,
        },
      });
      return mapConnection(data.connection, named(await providers()).get(data.connection.provider_id));
    },
    async reconnect(id, request) {
      const data = await apiRequest<{ authorization_url: string }>(`${one(id)}/reconnect`, {
        method: 'POST',
        body: {
          return_to: request.return_to,
          ...(request.bundle_key ? { scope_bundle: request.bundle_key } : {}),
        },
      });
      return data.authorization_url;
    },
    async testConnection(id) {
      const data = await apiRequest<{ result: 'ok' | 'failed'; status: ConnectionStatus; checked_at: string }>(
        `${one(id)}/test`,
        { method: 'POST' },
      );
      return { ok: data.result === 'ok', checked_at: data.checked_at, status: data.status };
    },
    async updateGrants(id, grants) {
      const data = await apiRequest<{ grants: WireGrant[] }>(`${one(id)}/grants`, {
        method: 'PUT',
        body: { grants: grantsToWire(grants) },
      });
      return mapGrants(data.grants);
    },
    async disconnect(id) {
      const data = await apiRequest<{ provider_revoked: boolean }>(one(id), { method: 'DELETE' });
      return { provider_revoked: data.provider_revoked };
    },
    async listActivity(id, cursor) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const data = await apiRequest<{
        events: Array<{ id: string; occurred_at: string; action: string; outcome: string | null }>;
        next_cursor: string | null;
      }>(`${one(id)}/activity${query}`);
      return {
        items: data.events.map((e) => ({
          id: e.id,
          occurred_at: e.occurred_at,
          action: e.action,
          outcome: e.outcome ?? null,
        })),
        next_cursor: data.next_cursor,
      };
    },
  };
}
