---
title: "Authentication Mechanism and Session Management"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "auth", "better-auth", "sessions"]
summary: "Better Auth with Prisma adapter in schema platform, 14-day sliding sessions, password policy, and social sign-in."
related_docs:
  - "README.md"
  - "0006-shared-postgres-platform-schema.md"
  - "0014-uuid-primary-keys.md"
  - "../../docs/implementation-plan/M0-foundations.md"
adr_id: "0017"
decision_status: "accepted"
supersedes: []
---

# 0017 Authentication Mechanism and Session Management

## Context
Sineva Platform requires a secure, self-hosted, multi-tenant authentication engine compliant with Indonesian Personal Data Protection (UU PDP) regulations. Storing customer authentication data in US-hosted third-party identity providers (such as Clerk or Auth0) introduces cross-border data transfer compliance overhead and per-user subscription fees.

## Options Considered
1. **Hosted Identity Providers (Clerk, WorkOS, Auth0)**: Quick to integrate, but violates UU PDP local data residency guidelines and introduces per-seat operational costs.
2. **Auth.js (NextAuth v5)**: Free and self-hosted, but complex session/organization lifecycle hooks and inconsistent multi-schema Prisma support.
3. **Better Auth (v1.1+) with Organization Plugin**: Built-in support for organizations (mapped to workspaces), two-factor authentication, social OAuth, session management, and explicit Prisma adapter support.

## Decision
We adopt **Better Auth** with the Prisma adapter targeted exclusively at the `platform` Postgres schema (`@@schema("platform")`).
- **Session Duration**: 14 days sliding expiration (`fresh_until` tracked for sensitive operations such as credential or email changes).
- **Password Policy**: Minimum 8 characters, maximum 128 characters, requiring at least one lowercase letter, one uppercase letter, and one number.
- **Table Schema**: Tables `users`, `accounts`, `sessions`, and `verifications` live in `platform` schema with UUID primary keys (`gen_random_uuid()`).
- **Social Sign-in**: Google and GitHub OAuth providers supported via Better Auth standard endpoints.

## Consequences
- Multi-tenant organizations map directly to `platform.workspaces` and `platform.workspace_members`.
- The database remains the single source of truth for identity under our own PostgreSQL instance.
- Sensitive profile and security mutations require a fresh session (`fresh_until` within 10 minutes).
