# Sineva Platform Implementation Checkpoint

> **Last Updated:** 2026-10-22 WIB  
> **Current Git Branch:** `feat/m0-platform` (integration branch, local, not pushed)  
> **Latest Commit:** see `git log feat/m0-platform`  
> **Current Milestone:** **M0 — Foundations**  
> **Last Completed Work Packages:** WP-M0-06..09, 30, 33, 34, 42, 48 (platform halves) + UI revamp  
> **Next:** batch 2: WP-M0-31, 32, 36, 37, 38; then 39 to 41, 43 to 46, 35, 47  

---

## 1. Project Directives & Constraints (CRITICAL FOR ALL AGENTS)

1. **Repo Scope:**
   - **Exclusively `sineva-platform`**.
   - **DO NOT TOUCH `sineva-ai`** (owned by Farhan / backend AI team).
2. **Domain Name:**
   - Corporate domain is **`sineva.id`** (e.g. `admin@sineva.id`).
   - **NEVER use `sineva.ai`** in default seeds, email contacts, or URLs.
3. **Authentication Architecture:**
   - **Custom JWT Auth ONLY** (No `better-auth`).
   - Stateless HMAC-SHA256 access tokens (`15m`), rotateable refresh tokens (`30d`), and DB `Session` tracking.
   - Passwords hashed using scrypt (`N=32768, r=8, p=1`).
4. **Database Safety Invariants:**
   - Database: PostgreSQL on port `5432`, database `sineva_platform`, dedicated schema `platform`.
   - **NEVER run `prisma migrate reset`, `prisma db push`, or `docker compose down -v`**.
   - Run migrations strictly via `DATABASE_URL='...?schema=platform' npx prisma migrate deploy`.
5. **Dev Server Execution:**
   - **DO NOT start dev server automatically via background daemon.**
   - The user runs and verifies the app manually on port `3001`:
     ```bash
     cd apps/web && npx next dev --hostname 127.0.0.1 --port 3001
     ```

---

## 2. Seeded Accounts & Test Credentials

The database has been migrated and seeded (`npm run db:seed`):
- **Sineva HQ (Admin):**
  - Email: `admin@sineva.id`
  - Password: `Password123!`
  - Workspace: `00000000-0000-0000-0000-000000000001` (`sineva-hq`)
- **Acme Corp (Owner):**
  - Email: `owner@acme.com`
  - Password: `Password123!`
  - Workspace: `00000000-0000-0000-0000-000000000002` (`acme-corp`)
- **Specialists Configured:** `@sinopeople`, `@sinofinance`, `@sinosales`, `@sinosocial`, `@sinohelp`, `@sinoinsights`.

---

## 3. Completed Work Packages (M0 Status)

| Work Package | Status | Key Deliverables & Evidence |
| :--- | :--- | :--- |
| **WP-M0-21** | **DONE** | Identity, session & credential domain entities & Prisma adapters. |
| **WP-M0-22** | **DONE** | Scrypt password hasher, rate limiting (Redis sliding log), Pwned Passwords k-anonymity check. |
| **WP-M0-23** | **DONE** | Email verification, password reset, lockout after 5 failures, anti-enumeration. |
| **WP-M0-24** | **DONE** | `SmtpEmailSender` port & adapter connecting to local Mailpit (`localhost:1025`). |
| **WP-M0-25** | **DONE** | Google & GitHub OAuth state validation & account linking. |
| **WP-M0-26** | **DONE** | Workspace domain, tenant-scoped repositories, C2 RBAC roles (`owner`, `admin`, `member`, `viewer`), cross-workspace 404 isolation. |
| **WP-M0-27** | **DONE** | Ed25519 signed context minting (`InternalAiEngineGateway`), key rotation, `/internal/v1/keys`. |
| **WP-M0-28** | **DONE** | AI Gateway v2 client (`InternalAiEngineGateway`), chat contract v2 adaptation. |
| **WP-M0-29** | **DONE** | Conversations & messages persistence, migration `20261021230000_conversations_and_messages`, private ownership (FR-HUB-32), idempotency on `client_message_id`, server mention re-parsing, room specialist pinning. |
| **UI revamp** | **DONE** | Chat-first shell (collapsible Linear-style sidebar, every planned feature with coming-soon pages, recent chats marked Team or specialist, user menu with Profile and Sign out, tooltips), Home vs New chat, Sintra-style rooms (Blender renders in `public/rooms`, living Sino loops), per-page auth scenes, @mention composer, profile API and page. |
| **WP-M0-06..09** | **DONE** | Hardening: test backdoors removed from `with_auth.ts` (header session resolver for tests), no secret defaults, nonce CSP (report-only), honest errors and request id. |
| **WP-M0-30** | **DONE (platform)** | SSE relay, `chat_runs` (migration `20261022090000_chat_runs`), cancel, client stream helper, streaming UI. ADR-0022. Live replies blocked on sineva-ai WP-M0-18. |
| **WP-M0-33 / 48** | **DONE (platform)** | `audit_events` (migration `20261022100000_audit_events`), route policy inventory, internal ingest; entitlement seam in `open` mode (`ENTITLEMENTS_MODE`). |
| **WP-M0-34** | **DONE (platform)** | PII detectors and `mask()` in `@sineva/shared`, allowlisted logger, lint bans `console` in server code. sineva-ai copy of vectors pending. |
| **WP-M0-42** | **DONE** | i18n EN/ID (in-repo translator, ADR-0023), catalogs in `apps/web/messages`, copy lint, all UI strings migrated. Indonesian needs native review. |
| **Hotfix (React 19)** | **DONE** | Commit `61855a0`: Suppressed React 19 false-positive console error regarding `<script>` tag in `next-themes` (`apps/web/src/client/store/provider.tsx`). |

---

## 4. Pending integrator actions

- Apply migrations to the shared DB: `DATABASE_URL='...?schema=platform' npx prisma migrate deploy` (chat_runs, audit_events).
- Run `npm run test:integration` on a throwaway test DB (not run in batch 1: local Docker hung).
- Add `ENTITLEMENTS_MODE=open` to `.env.example`.
- Blocked on sineva-ai team: WP-M0-13..20 (v2 contract, SSE, catalog), PII vectors copy, audit publisher.

## 5. Next Tasks (superseded list below kept for history)

1. **WP-M0-30: SSE relay and client stream helper**
   - Route: `/api/v1/workspaces/[workspace_id]/runs/[run_id]/events/route.ts` & cancel route.
   - Use Case: `StreamRunUseCase` connecting browser to BFF to `sineva-ai` streaming with persistence of the final assistant message.
   - Client: `src/client/lib/event_stream.ts`.
2. **WP-M0-31: Specialist registry on the platform and slug migration**
   - Canonical specialists manifest and `GET /api/v1/agents`.
3. **WP-M0-35: Cross-tenant canary suite and CI gate**.
