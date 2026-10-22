---
title: "ADR-0039: Connection grants, ownership scope and permissions"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "connections", "grants", "permissions", "rbac"]
summary: "A connection is workspace-owned or personal; specialists reach it through grants with read or write access; read is the default for specialists whose built-in skills declare the provider; write needs Owner or Admin; personal connections are hidden from other members at the repository."
related_docs:
  - "0019-role-and-permission-model.md"
  - "0036-credential-vault-kms-and-key-hierarchy.md"
  - "0037-oauth-flow-and-connector-driver.md"
  - "../api-spec/connections_endpoints.md"
adr_id: "0039"
decision_status: "Accepted"
supersedes: []
---

# ADR-0039: Connection grants, ownership scope and permissions

## Status

Accepted (2026-10-23). Founder delegated: PRD 08 FR-CONN-03, FR-CONN-04 and its permission table are the recommended option; the OQ-CONN-7 default (personal connections for personal-capable providers, Calendar only) applies. Unblocks WP-M2-17 and the later Tool Gateway (WP-M2-10).

## Decision

1. **Ownership scope.** `connection.owner_scope` is `workspace` (shared) or `user` (personal, with `owner_user_id`). Only providers with `personal_capable` in their manifest allow `user` scope (Google Calendar in v1.0). Payment providers are workspace-only.
2. **Visibility is a repository rule.** Listing and loading take the caller's user id and return workspace connections plus the caller's own personal ones. Another member's personal connection is a 404 for everyone, Admin and Owner included, so the filter is in the query and not in the UI.
3. **Grants.** `connection_grant` has `(connection_id, agent_slug)` unique, `access_level` (`read` or `write`, write implies read) and `approval_policy` (default `ask_every_time`, used by the gateway work). No row means no access. The API presents a matrix: one row per specialist of the manifest with `read` and `write` booleans.
4. **Defaults.** A new connection grants `read` to every specialist whose built-in skills declare the provider (a data table next to the specialist manifest until the skill bundles of WP-M2-24 replace it). Write is never granted by default.
5. **Who may change.** `connection.grant` (Owner, Admin) changes any grant; there is no member-level grant for their own personal connection in v1.0, which keeps "write needs Owner or Admin" one rule. Raising a grant to write on a provider whose actions are all read-only (the payment providers) is refused.
6. **Permissions** added to the one registry: `connection.view` (all roles), `connection.connect_workspace` (Owner, Admin), `connection.connect_personal` (Owner, Admin, Member), `connection.grant` (Owner, Admin), `connection.disconnect` (Owner, Admin; Member limited to their own personal connection, enforced by the use case), `connection.view_activity` (Owner, Admin).
7. **Disconnect** revokes at the provider (best effort, failure reported but not blocking), erases the vault secret, tombstones the row (`revoked`) and audits `connection.revoked`.
8. **Audit events** emitted by use cases: `connection.oauth_started`, `connection.created`, `connection.reconnected`, `connection.scope_downgraded`, `connection.token_refreshed`, `connection.refresh_failed`, `connection.needs_reconnect`, `connection.grant_changed`, `connection.secret_rotated`, `connection.revoked`. Payloads hold ids, scope keys and counts only.
9. **Responses never contain** tokens, keys, ciphertext or wrapped keys; scope keys are returned with labels so the UI shows plain words and keeps raw strings under technical details.

## Consequences

- An Admin cannot manage a member's personal connection, by design; a member who leaves leaves their personal connections behind until cleanup work (follow-up).
- The declared-provider table is a stopgap and must be replaced by skill manifests.
- Matrix rows are derived from the manifest, so a new specialist appears with no migration.

## Alternatives considered

- **Grants per user and specialist.** The PRD's gateway lookup mentions the user, but the connection already fixes the owner for personal ones. Rejected as redundant for v1.0.
- **`can_read` and `can_write` booleans.** Same information as the access level, but allows the invalid state write without read. Rejected.
- **UI-only hiding of personal connections.** Fails the tenant and privacy canary. Rejected.
