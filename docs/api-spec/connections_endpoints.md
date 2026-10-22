---
title: "Connections Endpoints"
category: "api-spec"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "api-spec", "connections", "oauth", "grants", "internal"]
summary: "Final API shapes for Connected tools: the provider catalog, connections, OAuth start and callback, API-key connect, test, grants matrix, disconnect, activity, plus the internal job routes. The UI builds against this file."
related_docs:
  - "overview.md"
  - "swagger_and_openapi.md"
  - "../decisions/0036-credential-vault-kms-and-key-hierarchy.md"
  - "../decisions/0037-oauth-flow-and-connector-driver.md"
  - "../decisions/0038-durable-job-runner.md"
  - "../decisions/0039-connection-grants-and-scopes.md"
---

# Connections endpoints

Status: shapes are final and stable; the UI may build against them now. Routes are added in commits after this file, in the order of the work packages (job runner, vault, registry, OAuth, refresh, API). Where a route is not live yet, its entry says so in the commit that adds it; the shape does not change. Envelope, `request_id` and error `code` mapping are in [overview](overview.md). Identity is the session user and the workspace is in the URL: no body, query or header names a user or a workspace. A workspace the caller is not a member of answers 404 on every route. Decisions: ADR-0036 to ADR-0039.

All JSON keys are snake_case. Timestamps are ISO 8601 strings in UTC. `LocalizedText` is `{"en": string, "id": string}`; the UI picks the active locale. Provider names (Google Calendar, Notion, Xendit, Midtrans) are proper names, not copy.

## Public routes

Prefix `/api/v1/workspaces/{workspace_id}/connections` unless noted.

| Route | Permission | What it does |
| :--- | :--- | :--- |
| `GET /providers` | `connection.view` | The catalog |
| `GET /` | `connection.view` | Connections visible to the caller |
| `GET /{connection_id}` | `connection.view` | One connection with its access matrix |
| `POST /oauth/start` | `connection.connect_workspace` or `connection.connect_personal` (by `owner_scope`) | Starts a flow, returns the provider URL |
| `POST /secret` | same as start | Connects an API-key provider (tests first), or rotates a key |
| `POST /{connection_id}/reconnect` | `connection.disconnect` | Starts a new flow that keeps the connection id |
| `POST /{connection_id}/test` | `connection.view` | Runs the health probe now |
| `PUT /{connection_id}/grants` | `connection.grant` | Replaces the access matrix |
| `DELETE /{connection_id}` | `connection.disconnect` | Revokes, erases and tombstones |
| `GET /{connection_id}/activity?cursor=&limit=` | `connection.view_activity` | Audit events of this connection |
| `GET /api/v1/connections/oauth/callback` | session cookie, no workspace segment | Provider redirect target (not called by the UI) |

Permissions: `connection.view` all roles; `connection.connect_workspace` owner, admin; `connection.connect_personal` owner, admin, member; `connection.grant` owner, admin; `connection.disconnect` owner, admin, and a member for their own personal connection; `connection.view_activity` owner, admin. A viewer can list but `can` flags are all false.

Mutating routes accept a Sineva session only (CSRF check applies to cookie auth).

## Types

```ts
type ConnectionStatus = 'connected' | 'partial' | 'needs_reconnect' | 'error' | 'revoked';
type AccessClass = 'read' | 'write' | 'admin';

interface ScopeView {
  scope_key: string;            // technical string, show under "Technical details" only
  label: LocalizedText;         // plain words
  access_class: AccessClass;
}

interface ProviderView {
  provider_id: string;          // 'google_calendar' | 'notion' | 'xendit' | 'midtrans' | 'mekari_jurnal' | ...
  display_name: string;
  category: 'calendar' | 'knowledge' | 'payments' | 'accounting' | 'messaging' | 'marketplace';
  status: 'available' | 'beta' | 'coming_soon';
  available: boolean;           // false when coming soon or no credentials are configured
  unavailable_reason: null | 'coming_soon' | 'credentials_not_configured';
  auth_type: 'oauth2_pkce' | 'api_key' | 'hmac' | 'embedded_signup';
  personal_capable: boolean;
  description: LocalizedText;
  specialists: string[];        // agent_slugs whose skills use it
  scope_bundles: Array<{
    bundle_key: string;
    label: LocalizedText;
    access_class: AccessClass;  // highest class in the bundle
    scopes: ScopeView[];
  }>;
  credential_fields: Array<{    // only for auth_type 'api_key'
    field_key: string;          // key inside `secret` of POST /secret
    label: LocalizedText;
    kind: 'secret' | 'choice';
    choices?: string[];         // for 'choice', e.g. ['sandbox', 'production']
  }>;
  can_connect_workspace: boolean;
  can_connect_personal: boolean;
}

interface GrantRow { agent_slug: string; read: boolean; write: boolean }  // write implies read

interface ConnectionView {
  id: string;
  provider_id: string;
  owner_scope: 'workspace' | 'user';
  is_mine: boolean;             // personal connection of the caller
  status: ConnectionStatus;
  auth_type: string;
  account_label: string | null; // "Connected as budi@tokolaris.id"
  scope_bundle: string | null;
  granted_scopes: ScopeView[];
  missing_scopes: ScopeView[];  // non-empty only when status is 'partial'
  last_health_at: string | null;
  last_error_code: string | null;
  secret_rotation_due_at: string | null;  // api_key connections: 90 days after the last save
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  grants: GrantRow[];           // one row per specialist, manifest order
  can: { grant: boolean; disconnect: boolean; reconnect: boolean; test: boolean; view_activity: boolean };
}
```

Responses never contain tokens, API keys, ciphertext or wrapped keys, in any route.

## Responses

- `GET /providers`: `data: { providers: ProviderView[] }`.
- `GET /`: `data: { connections: ConnectionView[] }`. Query `provider_id`, `status` filter; revoked tombstones are omitted unless `status=revoked`. Another member's personal connection is never listed, for admin and owner too.
- `GET /{id}`: `data: { connection: ConnectionView }`. 404 for a missing, foreign or other member's personal connection.

### `POST /oauth/start`

Body: `{ provider_id, scope_bundle, owner_scope: 'workspace' | 'user', return_to?: string }`. `return_to` is a relative path starting with `/w/` (default `/w/{workspace_slug}/connections`); anything else is 422. Response 200:

```json
{ "data": { "flow_id": "uuid", "authorization_url": "https://accounts.example/authorize?...", "expires_at": "2026-10-23T10:10:00.000Z" } }
```

The UI shows its consent screen first, then navigates the browser to `authorization_url`. Flows expire after 10 minutes and are single use.

### `GET /api/v1/connections/oauth/callback`

Called by the provider (cross-site GET, session cookie must be `SameSite=Lax`). Never returns JSON: always `302` to the flow's `return_to` with query parameters `connection_result` and, when known, `provider_id` and `connection_id`:

| `connection_result` | Meaning |
| :--- | :--- |
| `connected` | Connected with every requested scope |
| `partial` | Connected, some scopes not granted (`missing_scopes` on the connection) |
| `reconnected` | Reconnect finished, same connection id |
| `denied` | The person declined at the provider (calm message) |
| `duplicate_account` | That account is already connected (`connection_id` is the existing one; offer reconnect) |
| `different_account` | A reconnect was done with another account; nothing changed |
| `expired` | The flow expired or was already used |
| `error` | Anything else; no detail is given in the URL |

An unknown or mismatched `state` redirects to `/` with `connection_result=expired`.

### `POST /secret`

Body: `{ provider_id, owner_scope?: 'workspace', connection_id?: string, secret: { [field_key]: string } }`. `owner_scope` is `workspace` for API-key providers. With `connection_id` the key of that connection is replaced (audit `connection.secret_rotated`). The key is tested with the provider before anything is stored; a failed test stores nothing. Response 201 (new) or 200 (rotated): `data: { connection: ConnectionView }`. The secret is never echoed and never returned later.

### `POST /{id}/reconnect`

Body: `{ scope_bundle?: string, return_to?: string }`. OAuth connections answer like `/oauth/start`. API-key connections answer 409 `not_reconnectable` (use `POST /secret` with `connection_id`). Allowed for `needs_reconnect`, `partial`, `error` and `connected` (re-consent, also used to add scopes); 409 `connection_revoked` for a tombstone.

### `POST /{id}/test`

Response 200: `data: { result: 'ok' | 'failed', status: ConnectionStatus, error_code: string | null, checked_at: string }`. Updates `last_health_at` and `last_error_code`. A failed probe of an OAuth connection does not change its status by itself; a revoked grant at the provider (`invalid_grant`) sets `needs_reconnect`.

### `PUT /{id}/grants`

Body: `{ grants: GrantRow[] }`, at most one row per specialist; specialists not listed lose access. Validation: `write: true` needs `read: true`; unknown `agent_slug` is 422 `unknown_specialist`; `write: true` on a provider whose actions are all read-only (Xendit, Midtrans) is 422 `write_not_supported`. Response 200: `data: { grants: GrantRow[] }` (full matrix). Audit `connection.grant_changed`.

### `DELETE /{id}`

Revokes at the provider (best effort), crypto-erases the secret, tombstones the row. Response 200: `data: { id, status: 'revoked', revoked_at, provider_revoked: boolean }`. Repeating it is 200 with the same body. A member may delete only their own personal connection.

### `GET /{id}/activity`

Cursor-paginated audit events whose target is this connection: `data: { events: [{ id, occurred_at, action, outcome, actor_type, reason_code }], next_cursor }`. No payloads.

## Error codes

`errors[0].code` carries the specific code; top-level `code` follows the status.

| Status | `errors[0].code` | When |
| :--- | :--- | :--- |
| 401 | `unauthorized` | No session |
| 403 | `forbidden` | Role lacks the permission |
| 404 | `not_found` | Unknown or foreign workspace, connection or other member's personal connection |
| 409 | `provider_not_configured` | Credentials for the provider are not set in this environment |
| 409 | `provider_coming_soon` | Catalog entry without a driver |
| 409 | `duplicate_account` | Same external account already connected (`field: connection_id` holds the existing id) |
| 409 | `connection_revoked` | Action on a tombstone |
| 409 | `not_reconnectable` | Reconnect on an API-key connection |
| 422 | `validation_failed` | Body shape, `return_to`, unknown scope bundle |
| 422 | `owner_scope_not_allowed` | `user` scope on a provider that is not personal-capable |
| 422 | `connection_test_failed` | API-key test rejected the key (`detail` is `invalid_credentials` or `insufficient_permissions`) |
| 422 | `unknown_specialist`, `write_not_supported` | Grants validation |
| 503 | `provider_unreachable` | The provider did not answer during a test or exchange |
| 503 | `vault_unavailable` | The vault or its key service is not configured or reachable |

## Statuses and what the UI shows

`connected` normal; `partial` connected with fewer scopes than asked (list `missing_scopes`); `needs_reconnect` the refresh token was refused or the grant was revoked at the provider (banner, reconnect button); `error` health probe failing for another reason (`last_error_code`); `revoked` tombstone, shown only when filtered for. The UI-only states "not connected" and "connecting" are derived from the catalog and an in-flight redirect.

## Internal routes

`X-Internal-Api-Key` only; each is also mounted at `/api/internal/v1/...`.

| Route | What it does |
| :--- | :--- |
| `POST /internal/v1/jobs/tick` | Body optional `{ max_jobs?: number }` (1 to 100, default 25). Plans due jobs, reaps expired leases, runs ready jobs. Response `data: { planned, reaped, ran, succeeded, retried, failed }`. Call every minute |
| `GET /internal/v1/jobs/stats` | Queue depth: `queued`, `running`, `failed`, `oldest_due_seconds` |

## Audit events

`connection.oauth_started`, `connection.created`, `connection.reconnected`, `connection.scope_downgraded`, `connection.token_refreshed`, `connection.refresh_failed`, `connection.needs_reconnect`, `connection.grant_changed`, `connection.secret_rotated`, `connection.revoked`. Ids, scope keys and counts only.

## Provider credentials (environment)

Optional. A provider without them is listed with `available: false`. See [environment_variables](../deployment/environment_variables.md): `GOOGLE_CONNECT_CLIENT_ID`, `GOOGLE_CONNECT_CLIENT_SECRET`, `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, plus the vault variables `VAULT_LOCAL_KEK`, `VAULT_LOCAL_KEK_PREVIOUS`, `VAULT_DATABASE_URL`. The registered redirect URI is exactly `{NEXT_PUBLIC_APP_URL}/api/v1/connections/oauth/callback`.
