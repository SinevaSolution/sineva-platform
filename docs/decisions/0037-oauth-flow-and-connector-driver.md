---
title: "ADR-0037: OAuth flow and ConnectorDriver"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "oauth", "pkce", "connectors", "connections"]
summary: "Authorization code with PKCE S256, one-time state bound to the session, built in-house behind a ConnectorDriver interface; Sineva owns every provider app registration; provider credentials come from environment variables, separate from sign-in OAuth."
related_docs:
  - "0036-credential-vault-kms-and-key-hierarchy.md"
  - "0039-connection-grants-and-scopes.md"
  - "../api-spec/connections_endpoints.md"
adr_id: "0037"
decision_status: "Accepted"
supersedes: []
---

# ADR-0037: OAuth flow and ConnectorDriver

## Status

Accepted (2026-10-23). Founder delegated: backlog items P-20 (build versus buy and `ConnectorDriver`) and P-21 (provider OAuth apps) carry recommended options, and the Founder delegated acceptance to WP-M2-01. Provider-specific parameters marked "recalling, not verified" stay behind OQ-CONN-8 and must be checked against provider documentation before the matching driver goes live. Unblocks WP-M2-09, WP-M2-14, WP-M2-15, WP-M2-17.

## Context

Connections need a consent and token flow that survives RFC 9700 review: exact redirect URIs, PKCE S256, single-use state bound to the user agent, issuer check. Google Calendar, Notion, Xendit and Midtrans ship first, Indonesian providers later, so the provider-specific part must be small.

## Decision

1. **Build in-house** for about ten connectors (vault, consent, refresh, gateway) behind `ConnectorDriver`: `authorize`, `exchange`, `refresh`, `revoke`, `whoami`, `actions`; auth types `oauth2_pkce`, `api_key`, `hmac`, `embedded_signup`. A config-driven OAuth2 driver reads endpoints and parameters from the provider manifest; a provider with quirks gets its own driver class later. Revisit a self-hosted broker only past about fifteen connectors.
2. **Manifests are data.** Provider, scope bundle, scope labels (English and Indonesian), access class, auth endpoints, egress allowlist and actions live in code manifests, the single source of truth that the gateway, the API and skills import. There are no `integration_provider`, `provider_scope` or `provider_app` tables: with no per-environment registration data to store (credentials are env), a table would only duplicate the manifest and invite drift.
3. **Provider credentials** come from environment variables per provider (`GOOGLE_CONNECT_CLIENT_ID` and `_SECRET`, `NOTION_CLIENT_ID` and `_SECRET`), separate from the sign-in variables `GOOGLE_CLIENT_ID` and `GITHUB_CLIENT_ID`. They are optional: a provider without them is listed as unavailable with reason `credentials_not_configured` and cannot start a flow. Sineva owns every registration (P-21).
4. **Start.** Identity and workspace come from the session, never the body. The server checks the permission, creates an `oauth_flow` row (256-bit random `state` stored as SHA-256, PKCE verifier encrypted in the vault, `nonce`, requested scopes, exact `redirect_uri`, expected `issuer`, hash of the session id, `return_to` restricted to a relative path that starts with `/w/`, expiry now plus 10 minutes) and returns the provider URL. Only the selected scope bundle is requested.
5. **Callback** (`GET /api/v1/connections/oauth/callback`, a global path; it is a cross-site top-level GET, so the session cookie must be `SameSite=Lax`) validates in order: provider `error`; atomic single-use consume of the flow (`UPDATE ... WHERE consumed_at IS NULL RETURNING`); expiry; session user equals flow user and still holds the role; session hash equals the recorded hash; `iss` equals the recorded issuer when the provider sends one (RFC 9207). Only then the token exchange runs, server side, with the verifier. The callback changes no state other than the flow and the connection, and always answers 302 to the stored `return_to` with a result code.
6. **After exchange:** `whoami` gives `external_account_id` and a label; granted scopes are compared with requested ones (fewer means status `partial`); an active connection for the same account answers `duplicate_account`; tokens go to the vault; audit `connection.created` (or `connection.reconnected`, `connection.scope_downgraded`).
7. **Reconnect keeps `connection_id`** and its grants. A different `external_account_id` is refused with `different_account` and nothing changes.
8. **Redirect URIs** are exact strings built from `NEXT_PUBLIC_APP_URL` plus the fixed callback path. No wildcards, no implicit grant, no scopes beyond the chosen bundle.
9. **API-key providers** (Xendit, Midtrans) use the same driver interface: the pasted secret is tested through the driver's `whoami` before anything is stored, and the secret travels in the body of one call only.
10. **Tests** run against a fake OAuth provider server in `src/__tests__/fakes` with configurable `iss`, scope downgrade, rotating refresh tokens and `invalid_grant`.

## Consequences

- Five states of a connection need UI: connected, partial, needs reconnect, error, revoked.
- Google's real consent parameters (offline access, forced consent for a refresh token) are recalled, not verified; they sit in the manifest and are verified before the Google driver is enabled in an environment.
- Notion tokens are recalled as non-expiring with no refresh token; the manifest models that as a token lifetime of `non_expiring`. Not verified.
- Midtrans has no cheap account call; its connection test uses a status lookup for a reserved unknown order id and treats "not found" as a valid key and 401 as invalid. Recalled, not verified.

## Alternatives considered

- **Nango or Composio.** Tokens would live at a vendor (cross-border question, no residency), and Indonesian providers need custom work anyway. Rejected for v1.0 by the plan.
- **Provider tables with seeds.** Duplicates the manifest and needs migrations for every copy change. Rejected, see decision 2.
- **State in a signed cookie only.** Not revocable and not single-use without a server record. Rejected.
