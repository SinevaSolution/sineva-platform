---
title: "Secret Inventory & Key Management"
category: "deployment"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Security & Infrastructure"
tags: ["sineva", "security", "secrets", "rotation", "inventory", "credentials"]
summary: "Comprehensive inventory of credentials, cryptographic keys, owners, rotation windows, and runbook links (FR-SEC-39)."
related_docs:
  - "environment_variables.md"
  - "internal_network_security.md"
  - "../governance/agent_rules.md"
  - "../development/known_issues_and_tech_debt.md"
---

# Secret Inventory & Key Management

Per **FR-SEC-39**, every secret, API key, and cryptographic token in Sineva Platform is tracked in this inventory with its owner, required rotation schedule, and operational runbook.

In production, a missing or blank secret, or one that matches a known development value, stops startup (`SEC-4`). Development and tests read their values from `.env.example`; the code carries no credential default.

## Secret Inventory Table

| Secret Name | Purpose | Scope / Location | Owner | Rotation Period | Overlap Window | Runbook / Procedure |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` (password component) | PostgreSQL connection authentication for `platform` schema | Server-only (`env.ts`, Docker/K8s secrets) | Platform Infra | 90 days | Zero downtime via dual-user switch in Postgres | Rotate database user password, update secret store, trigger rolling deployment |
| `S3_SECRET_ACCESS_KEY` | SeaweedFS S3 API authentication for presigned URLs & asset storage | Server-only (`env.ts`, Docker/K8s secrets) | Platform Infra | 90 days | Dual-key rotation in SeaweedFS | Generate second S3 key pair in SeaweedFS, update environment, revoke previous key |
| `AI_ENGINE_INTERNAL_API_KEY` | Shared symmetric service authentication token between BFF and `sineva-ai` (`X-Internal-Api-Key`) | Server-only (`env.ts`, `settings.py`) | Platform Infra & AI Runtime | 30 days | Dual-key support via `AI_ENGINE_INTERNAL_API_KEY_NEXT` | Set `..._NEXT` on both services, switch primary key, deploy, remove old key |
| `AUTH_SECRET` | Signs access tokens and authentication state | Server-only (`env.ts`, custom JWT auth) | Platform Security | 90 days | Sliding session re-authentication | Rotate secret in secret manager during maintenance window; invalidates older idle sessions |
| `INTERNAL_CONTEXT_SIGNING_KEY` | Private Ed25519 key used to mint signed context JWS tokens for cross-service calls | Server-only (`env.ts`) | Platform Security | 60 days | Key ID (`kid`) rotation with 2 active public keys in `sineva-ai` | Generate new Ed25519 key pair, add public key to `sineva-ai` with `kid=k2`, point platform to `k2`, rotate `k1` out |

## Rotation Rules

1. **No Production Defaults (R-28)**: Application boots only with genuine, high-entropy secrets outside local development.
2. **Dual-Key Rotation Support (FR-SEC-02)**: Service tokens and signing keys support an active overlap window (`_NEXT` key or `kid` header) so rotations require zero downtime.
3. **Automated Secret Scanning (FR-SEC-40)**: CI runs TruffleHog and custom regex scanning on every pull request to guarantee no credentials or private key headers (`-----BEGIN ... KEY-----`) are committed.

## Related

[Environment Variables](environment_variables.md), [Internal Network Security](internal_network_security.md), [CI/CD Pipeline](ci_cd_pipeline.md).
