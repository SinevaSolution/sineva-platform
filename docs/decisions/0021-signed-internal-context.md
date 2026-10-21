---
title: "Signed Internal Context for Service-to-Service Invocations"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "security", "jws", "signed-context", "cross-service"]
summary: "EdDSA asymmetric JWS token (X-Sineva-Context) passing tenant, user, permissions, and budget constraints from platform to sineva-ai."
related_docs:
  - "README.md"
  - "0001-bff-gateway.md"
  - "0013-internal-service-auth-header.md"
  - "../../docs/implementation-plan/M0-foundations.md"
adr_id: "0021"
decision_status: "accepted"
supersedes: []
---

# 0021 Signed Internal Context for Service-to-Service Invocations

## Context
When `sineva-platform` calls `sineva-ai` to execute agent turns or tools, the AI engine needs cryptographically verified tenant and user claims. Relying solely on `X-Internal-Api-Key` allows any internal caller to spoof any tenant or user ID.

## Options Considered
1. **Symmetric HMAC (HS256)**: Shared secret signs and verifies tokens. Problem: `sineva-ai` could mint its own tokens or forge platform identity claims.
2. **Asymmetric JWS (EdDSA with Ed25519 Keys)**: Platform holds private key and mints tokens; `sineva-ai` holds public key and only verifies tokens. Fast verification, short signatures, non-forgeable.

## Decision
We adopt **Asymmetric EdDSA (Ed25519) Compact JWS**:
- **Header**: `X-Sineva-Context`.
- **TTL**: 60 seconds lifetime (`exp = iat + 60s`).
- **Replay Protection**: Unique `jti` UUID verified against Redis cache with 120s expiry.
- **Key Rotation**: JWS header carries `kid` (key identifier), allowing zero-downtime key rotation with two concurrent valid public keys.
- **Claims (FR-AIR-06)**:
  - `tenant_id` (UUID): Target workspace ID.
  - `user_id` (UUID): Authenticated user ID.
  - `role` (string): User's workspace role.
  - `session_id` (UUID): Conversation session ID.
  - `request_id` (UUID): Tracing request ID.
  - `allowed_agents` (string[]): Specialists the user is allowed to access.
  - `autonomy_ceiling` (string): Maximum autonomous action level.
- **Coexistence**: `X-Internal-Api-Key` remains as transport-level service authentication, while `X-Sineva-Context` provides caller authorization and tenant scoping.

## Consequences
- `sineva-ai` rejects any chat or tool execution that lacks a valid, signed, non-expired, un-replayed context token.
- Cross-tenant data retrieval or execution inside `sineva-ai` is prevented cryptographically.
