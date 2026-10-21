---
title: "Role and Permission Model (RBAC)"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "rbac", "permissions", "roles"]
summary: "Four static workspace roles (owner, admin, member, viewer), permission registry in code, and per-specialist scoping."
related_docs:
  - "README.md"
  - "0018-workspace-tenancy-and-public-contract.md"
  - "../../docs/implementation-plan/M0-foundations.md"
adr_id: "0019"
decision_status: "accepted"
supersedes: []
---

# 0019 Role and Permission Model (RBAC)

## Context
Sineva Platform needs a clean, predictable authorization model for workspace collaboration across Indonesian SMBs and enterprises.

## Options Considered
1. **Dynamic Custom Roles per Workspace**: Flexible but complex, hard to audit, prone to privilege escalation, and premature for v1.0.
2. **Four Static Roles with Permission Registry**: Fixed set of 4 well-understood roles (`owner`, `admin`, `member`, `viewer`), granular canonical permission keys defined in a single code registry (`server/domain/permissions/registry.ts`), and optional per-specialist access scoping for members.

## Decision
We adopt **Four Static Roles with a Pure Domain Permission Registry**:
1. **Roles Hierarchy**:
   - `owner`: Full control, billing, workspace deletion, transfers, member management. Exactly one owner per workspace enforced by partial unique index.
   - `admin`: Member invitation, settings configuration, specialist management, audit viewing.
   - `member`: Chat execution, tool usage, library upload, file creation.
   - `viewer`: Read-only access to chats, files, and outputs; cannot initiate runs or modify configuration.
2. **Specialist Scoping**:
   - `specialist_scope` on `WorkspaceMember` can be `'all'` (default) or `'selected'` (linked to `WorkspaceMemberSpecialist` rows).
3. **Platform Staff**:
   - Administrative and operator roles live outside workspace tenancy in `platform.platform_staff` table (`operator`, `platform_admin`, `support`), never as workspace members.

## Consequences
- Route guards enforce permissions cleanly via `withAuth(handler, { permission: '...' })`.
- Role matrix tests verify all routes against the canonical permission specification.
