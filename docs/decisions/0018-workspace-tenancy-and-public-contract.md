---
title: "Workspace Tenancy Model and Public Contract Change"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "tenancy", "contract", "breaking-change"]
summary: "Workspace as tenant unit, URL-based tenancy resolution, and removal of client-supplied user_id and workspace_id from request bodies."
related_docs:
  - "README.md"
  - "0001-bff-gateway.md"
  - "0003-snake-case-wire-contract.md"
  - "../governance/agent_rules.md"
adr_id: "0018"
decision_status: "accepted"
supersedes: []
---

# 0018 Workspace Tenancy Model and Public Contract Change

## Context
Initial prototype endpoints accepted `user_id` and `workspace_id` directly in JSON request bodies (e.g. `POST /api/v1/agents/[agent_slug]/chat` and `/storage/presign`). This enabled cross-tenant impersonation where an untrusted client could claim any identity (tracked in technical debt as SEC-2 and SEC-3, violating R-27).

## Options Considered
1. **Implicit Tenancy via Session Cookie Only**: Routes do not specify the workspace in the URL; workspace is inferred from the user's active workspace session state. Problem: Users cannot open two workspaces in different browser tabs simultaneously.
2. **Path-Based Tenancy (`/w/{slug}` and `/api/v1/workspaces/{workspace_id}/...`)**: Workspace is explicitly declared in the URL path. Server authenticates caller from session, fetches user membership for the targeted workspace, and enforces isolation. If the user is not a member, the route answers HTTP 404 (never 403, preventing workspace enumeration).

## Decision
We adopt **Path-Based Tenancy**:
1. **URL Routing**:
   - Web application pages live under `/w/{workspace_slug}/...`.
   - Workspace-scoped API routes live under `/api/v1/workspaces/{workspace_id}/...`.
   - Global routes remain un-prefixed (`/account/*`, `/api/auth/*`, `/api/v1/health`, `/api/openapi.json`).
2. **Public Contract Change (Breaking Change)**:
   - `user_id` and `workspace_id` are permanently removed from all client request bodies.
   - Any request targeting another tenant's resource returns `404 Not Found` (FR-AUTH-24).
   - Identity and active tenancy are resolved server-side through `RequestContext`.
3. **Data Model**:
   - `User` and `Workspace` have a many-to-many relationship via `WorkspaceMember`.
   - Every tenant-owned table carries `workspace_id NOT NULL` with an index leading with `workspace_id` (FR-AUTH-29).

## Consequences
- SEC-2 and SEC-3 vulnerabilities are permanently eliminated.
- Client applications must pass workspace id in the URL path, not in payloads.
