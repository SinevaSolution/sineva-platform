---
title: "Multi-Tenancy Isolation Layers and Workspace Lifecycle"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "tenancy", "lifecycle", "isolation"]
summary: "Seven pooled isolation layers, seven workspace lifecycle states, and defense in depth."
related_docs:
  - "README.md"
  - "0006-shared-postgres-platform-schema.md"
  - "0018-workspace-tenancy-and-public-contract.md"
adr_id: "0020"
decision_status: "accepted"
supersedes: []
---

# 0020 Multi-Tenancy Isolation Layers and Workspace Lifecycle

## Context
Sineva operates as a multi-tenant SaaS. Tenants must be strictly isolated across web application, database, cache, vector store, and AI engine execution without data leakage.

## Options Considered
1. **Database-per-Tenant**: Highest isolation, but excessive operational overhead, high resource consumption, and slow provisioning for thousands of SMBs.
2. **Pooled Multi-Tenancy with Defense-in-Depth Isolation Layers**: Shared database, with mandatory tenant scoping on every query, signed context tokens, and explicit lifecycle state enforcement.

## Decision
We adopt **Pooled Multi-Tenancy with Multi-Layer Defense**:
1. **Seven Isolation Layers (FR-SEC-03)**:
   - Layer 1: Path & URL routing (`/w/{slug}`, `/api/v1/workspaces/{id}`).
   - Layer 2: Authentication & session resolution (`RequestContext`).
   - Layer 3: Route guard permission check (`withAuth`).
   - Layer 4: Application service tenant boundary.
   - Layer 5: Repository layer requiring `workspace_id NOT NULL` and leading index.
   - Layer 6: Signed internal context (`X-Sineva-Context`) passed to `sineva-ai`.
   - Layer 7: Cross-tenant automated canary integration test suite in CI.
2. **Seven Workspace Lifecycle States (FR-AUTH-32)**:
   - `trialing`: Active trial period, subject to token caps.
   - `active`: Normal paying subscription.
   - `past_due`: Payment failed, grace period active.
   - `read_only`: Read allowed (export, view chats), runs and mutations blocked.
   - `suspended`: All access blocked due to terms violation or administrative hold.
   - `pending_deletion`: Marked for deletion, 30-day recovery window.
   - `deleted`: Hard-deleted / soft-deleted permanently.

## Consequences
- Every tenant table requires `workspace_id` UUID non-null.
- When workspace is `read_only` or `suspended`, mutation routes refuse execution immediately.
