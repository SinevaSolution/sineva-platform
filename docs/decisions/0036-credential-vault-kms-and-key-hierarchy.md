---
title: "ADR-0036: Credential vault, KMS port and key hierarchy"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "vault", "kms", "encryption", "connections", "secrets"]
summary: "Connection tokens, API keys and later model keys live in one generalized vault_secret table, encrypted with a per-secret AES-256-GCM data key wrapped by a key-encryption key behind a KmsPort. A separate database role reads the table; plaintext exists only in process memory for a call."
related_docs:
  - "0008-no-silent-fallbacks.md"
  - "0020-multi-tenancy-isolation-and-lifecycle.md"
  - "0037-oauth-flow-and-connector-driver.md"
  - "0039-connection-grants-and-scopes.md"
  - "../engineering/logging_and_pii_masking.md"
adr_id: "0036"
decision_status: "Accepted"
supersedes: []
---

# ADR-0036: Credential vault, KMS port and key hierarchy

## Status

Accepted (2026-10-23). Founder delegated: the implementation plan's ADR backlog (P-18 vault and key hierarchy, P-19 generalized vault) names the recommended options and the Founder delegated their acceptance to the work package that builds the vault (WP-M2-05, ADR set of WP-M2-01). D-M2-2 (where the production KEK lives) stays open: development uses a local adapter and the production adapter is chosen before M5 (OQ-CONN-1). Unblocks WP-M2-05, WP-M2-09, WP-M2-14, WP-M2-15, WP-M2-17 and later WP-M2-10 and WP-M2-35.

## Context

Connections hold OAuth access and refresh tokens and pasted API keys. The model must never see them (security non-negotiable 5), logs must never carry them, and a copied database row or a leaked application database role must not be enough to read them. PRD 08 (FR-CONN-15 to FR-CONN-19, FR-CONN-40) and PRD 20 (BYOK) need the same store, so the table is generalized once.

## Decision

1. **One table, `vault_secret`,** with `owner_type` (`connection`, `oauth_flow`, `model_credential`), `owner_id`, `workspace_id`, `provider_id`, `ciphertext`, `nonce`, `dek_wrapped`, `kek_id`, `key_version` (the KEK version), `version` (optimistic row version) and unique `(owner_type, owner_id)`. `oauth_flow` holds the PKCE verifier between start and callback. Expiry timestamps of access tokens are not secret and live on `connection` (`access_expires_at`, `refresh_expires_at`), so the refresh scheduler never reads the vault.
2. **Envelope encryption.** Every write draws a fresh 256-bit data key (DEK) and a fresh 96-bit random nonce, encrypts the JSON payload with AES-256-GCM and wraps the DEK with the KEK through `KmsPort` (`wrapDek`, `unwrapDek`, `rotate`). A fresh DEK per write means a nonce can never repeat under one key. The wrapped DEK is itself AES-GCM output.
3. **AAD.** The authenticated data is the canonical JSON array `["sineva.vault.v1", owner_type, owner_id, workspace_id, provider_id]`, used for the payload and for the DEK wrap. A row copied to another workspace, owner or provider fails authentication.
4. **KmsPort adapters.** `LocalKms` (development, tests): the KEK comes from `VAULT_LOCAL_KEK` as `<kek_id>:<base64 of 32 bytes>`; `VAULT_LOCAL_KEK_PREVIOUS` (same form) lets rotation unwrap rows written under the old KEK. In production the adapter refuses a KEK whose id matches a known development default (same marker matcher as the other secrets: `dev`, `example`, `changeme` between separators) and refuses a key that is not exactly 32 bytes. A `CloudKmsStub` throws a typed `VaultUnavailableError` until D-M2-2 is decided. There is no hardcoded default key in code; development values come from `.env.example`.
5. **Role separation.** The vault is reached only through a second Prisma client built from `VAULT_DATABASE_URL`. Production runs it as role `sineva_vault`, which alone has privileges on `vault_secret`; the application role `sineva_app` has none. `apps/web/prisma/ops/vault_roles.sql` holds the DDL as an operator-run script (not a Prisma migration, because roles are cluster objects and migrations also run on developer databases). In development `VAULT_DATABASE_URL` may be unset and the main client is used; in production an unset value makes the vault fail typed instead of silently using the application role.
6. **Read surface.** The domain has a write-only `SecretWriter` (`put`, `erase`) and a read `SecretReader` (`get`). Only the credential resolver (and the refresh worker through it) imports `SecretReader`. A static test fails if another file does, or if any file outside the vault repository touches the `vault_secret` table or the Prisma delegate.
7. **Erase.** Disconnect deletes the `vault_secret` row (ciphertext and wrapped DEK) and keeps the `connection` row as a `revoked` tombstone with its personal fields cleared.
8. **KEK rotation** is a runbook command that rewraps DEKs (`rotate`) without touching ciphertext. It is not scheduled.
9. **No debug decrypt.** There is no endpoint, script or log line that returns plaintext. Redaction patterns (WP-M2-06) cover token shapes as a second layer.

## Consequences

- Reads cost a KMS unwrap; refresh and gateway calls pay it per call. A per-process DEK cache is deliberately not built.
- A restore from backup can resurrect revoked ciphertext. The reconcile job (WP-M2-15) probes every connection after a restore.
- Two connection pools in production; the vault pool is small and idle most of the time.
- Until D-M2-2 is decided, production deployments of connections need a real local KEK injected from the secret store, which is weaker than a KMS because the KEK sits in process memory.

## Alternatives considered

- **Sibling `connection_secret` and `model_credential_secret` tables.** Two tables with the same role setup and the same code. Rejected (OQ-CONN-10 default: generalize).
- **Column encryption in Postgres (pgcrypto).** Keys would pass through SQL and statement logs. Rejected.
- **One DEK per connection reused across writes.** Needs nonce bookkeeping under one key. A fresh DEK per write is simpler to prove safe.
- **Column-level grants instead of a second role.** Upserts and `RETURNING` need SELECT, so the application role would still read ciphertext. A separate role and client is simpler and testable.
