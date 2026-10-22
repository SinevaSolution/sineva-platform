# Sineva Platform Implementation Checkpoint

> **Last Updated:** 2026-10-22 (checkpoint continuation and React runtime fixes)  
> **Branch:** `main` (PR #1 merged `feat/m0-platform`, see section 0); keep integrating on `feat/m0-platform` and open a PR per batch  
> **Current Milestone:** M0 Foundations, with M1 items pulled forward  
> **Resume here:** section 0

---

## 0. Resume here (continued 2026-10-22)

**Current checkout:** `feat/m0-platform`. PR #1 is confirmed merged. The three saved branches in the paused checkpoint are now integrated locally:

| Work                                        | Integration                     | Current status                                                                                           |
| :------------------------------------------ | :------------------------------ | :------------------------------------------------------------------------------------------------------- |
| WP-M1-40 Inbox backend                      | `4ed6d85`                       | Integrated; unit and real PostgreSQL tests pass. Deployment and expiry scheduler pending.                |
| WP-M1-32 Library backend                    | `c09fcdc`                       | Integrated; contract, route and repository tests pass. AI ingest remains a proposal.                     |
| WP-M1-35/36 Business Profile and onboarding | `44f586d` plus completion fixes | Integrated; missing OpenAPI/policy registrations and route tests repaired. Member welcome now completes. |
| React context boundary error                | `4fe4b5a`                       | Fixed in FieldContext, SNField and fallback card, with regression guard.                                 |
| React client script warning                 | `a0171b0`                       | Theme bootstrap now uses server HTML insertion once with nonce; no console suppression.                  |

**UI now implemented:** members and invitations at `/w/{slug}/settings/members`, public `/invite/{token}` and `/ownership/{token}`, Inbox, Library, first-workspace creation, saved onboarding and Business Profile at `/w/{slug}/settings/business`. These are functional screens; full design acceptance is still open. See [the integration report](docs/development/resume-batch-2026-10-22.md) for implemented behavior, verification and exact gaps.

**Next work, in order**

1. Complete the local release step after the requested database confirmation. A read-only query confirmed local history in `public`; proposed recovery moves `_prisma_migrations` to `platform`, then uses `migrate deploy` with `?schema=platform`. All 15 migrations passed on a disposable PostgreSQL database. Never reset the shared database.
2. Browser-check the two runtime fixes and new flows on the Founder-run server at port 3001. No dev server was started. Port 3001 had no listener when checked.
3. Finish design acceptance: members detail/acceptance journeys, Inbox row/filter/diff/mobile behavior, Library multi-upload/folder tree/filter/usage UI, onboarding About you and in-wizard scan review. The integration report lists the remaining items; do not call WP-M1-29/33/38/41 fully accepted yet.
4. Coordinate acceptance of the proposed approval, Library and scan fixtures with the sineva-ai team. No files outside `sineva-platform` were edited.
5. Finish M0: WP-M0-35 real repository/Qdrant canaries (the 71-route platform lane is now in CI), WP-M0-41 gallery and browser harness, WP-M0-43..46 audits, WP-M0-47 integration gate.

**CI**

- Jobs: Lint/Typecheck/Test/Build and Integration pass. Security & Compliance failed twice on our side and was fixed: credential pattern false positives (`4ef5112`) and `npm sbom` rejecting React 18-only peers of the unused `swagger-ui-react` (removed in `2d56b83`). Local `npm sbom` is not a reliable check because worktree agents changed the shared `node_modules`; trust CI.

**Founder decisions this session (also in the plan or ADRs)**

- Components use the `SN` prefix (`SNButton`, `SNSelect`, ...), ADR-0028; a test enforces it; native `<select>` is banned.
- Customer chats: own section after Inbox, default mode Draft, SinoHelp owns customer replies (D-M3-9, WP-M3-44/45, Linear "PRD Addendum: Customer chats").
- BYOK keys: vault-encrypted (AES-256-GCM envelope) and shown only as `key_hint` (prefix + last 4) after save (added to WP-M2-35 and WP-M3-32).
- Invitations pulled forward (WP-M1-28 done); seat limits per plan tier stay `open` until M6.
- Rooms are office scenes (Blender, `sino-3d-mascot/scripts/rooms/`), Sino placement fractions in `room_stage.tsx`.
- sineva-ai docs may be updated with contracts (docs only, no code, no commits there): `sineva-ai/docs/api-spec/platform_integration_contract.md` lists gaps G-01..G-16 (G-12 fixed on the platform).

**Pending for the Founder**

- Storage bucket CORS for `PUT` from the app origin (avatar and library uploads).
- Add `ENTITLEMENTS_MODE=open` to `.env.example` (agents cannot read or edit it).
- Browser pass of the new UI (no agent started a dev server): theme script fix, SN components, glow, rooms, profile tabs, rename/delete dialog, cast picker.
- Native review of Indonesian copy.

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

| Work Package          | Status              | Key Deliverables & Evidence                                                                                                                                                                                                                                                                                                                                                                                                 |
| :-------------------- | :------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WP-M0-21**          | **DONE**            | Identity, session & credential domain entities & Prisma adapters.                                                                                                                                                                                                                                                                                                                                                           |
| **WP-M0-22**          | **DONE**            | Scrypt password hasher, rate limiting (Redis sliding log), Pwned Passwords k-anonymity check.                                                                                                                                                                                                                                                                                                                               |
| **WP-M0-23**          | **DONE**            | Email verification, password reset, lockout after 5 failures, anti-enumeration.                                                                                                                                                                                                                                                                                                                                             |
| **WP-M0-24**          | **DONE**            | `SmtpEmailSender` port & adapter connecting to local Mailpit (`localhost:1025`).                                                                                                                                                                                                                                                                                                                                            |
| **WP-M0-25**          | **DONE**            | Google & GitHub OAuth state validation & account linking.                                                                                                                                                                                                                                                                                                                                                                   |
| **WP-M0-26**          | **DONE**            | Workspace domain, tenant-scoped repositories, C2 RBAC roles (`owner`, `admin`, `member`, `viewer`), cross-workspace 404 isolation.                                                                                                                                                                                                                                                                                          |
| **WP-M0-27**          | **DONE**            | Ed25519 signed context minting (`InternalAiEngineGateway`), key rotation, `/internal/v1/keys`.                                                                                                                                                                                                                                                                                                                              |
| **WP-M0-28**          | **DONE**            | AI Gateway v2 client (`InternalAiEngineGateway`), chat contract v2 adaptation.                                                                                                                                                                                                                                                                                                                                              |
| **WP-M0-29**          | **DONE**            | Conversations & messages persistence, migration `20261021230000_conversations_and_messages`, private ownership (FR-HUB-32), idempotency on `client_message_id`, server mention re-parsing, room specialist pinning.                                                                                                                                                                                                         |
| **UI revamp**         | **DONE**            | Chat-first shell (collapsible Linear-style sidebar, every planned feature with coming-soon pages, recent chats marked Team or specialist, user menu with Profile and Sign out, tooltips), Home vs New chat, Sintra-style rooms (Blender renders in `public/rooms`, living Sino loops), per-page auth scenes, @mention composer, profile API and page.                                                                       |
| **WP-M0-06..09**      | **DONE**            | Hardening: test backdoors removed from `with_auth.ts` (header session resolver for tests), no secret defaults, nonce CSP (report-only), honest errors and request id.                                                                                                                                                                                                                                                       |
| **WP-M0-30**          | **DONE (platform)** | SSE relay, `chat_runs` (migration `20261022090000_chat_runs`), cancel, client stream helper, streaming UI. ADR-0022. Live replies blocked on sineva-ai WP-M0-18.                                                                                                                                                                                                                                                            |
| **WP-M0-33 / 48**     | **DONE (platform)** | `audit_events` (migration `20261022100000_audit_events`), route policy inventory, internal ingest; entitlement seam in `open` mode (`ENTITLEMENTS_MODE`).                                                                                                                                                                                                                                                                   |
| **WP-M0-34**          | **DONE (platform)** | PII detectors and `mask()` in `@sineva/shared`, allowlisted logger, lint bans `console` in server code. sineva-ai copy of vectors pending.                                                                                                                                                                                                                                                                                  |
| **WP-M0-42**          | **DONE**            | i18n EN/ID (in-repo translator, ADR-0023), catalogs in `apps/web/messages`, copy lint, all UI strings migrated. Indonesian needs native review.                                                                                                                                                                                                                                                                             |
| **WP-M0-31**          | **DONE (platform)** | Specialist manifest (display copy, EN/ID), `agent_configs` dropped, workspace agents route (ADR-0024).                                                                                                                                                                                                                                                                                                                      |
| **WP-M0-32**          | **DONE (platform)** | Card schema registry, `message_cards`, fallback renderer (ADR-0025).                                                                                                                                                                                                                                                                                                                                                        |
| **WP-M0-36**          | **DONE**            | Profile attributes, preferences, avatar pipeline, revamped profile page (ADR-0026). Email change deferred.                                                                                                                                                                                                                                                                                                                  |
| **WP-M0-37 / 38**     | **DONE**            | Compro token re-base, theme script, design lint, token and contrast tests (ADR-0027).                                                                                                                                                                                                                                                                                                                                       |
| **WP-M0-39 / 40**     | **DONE**            | SN component library (32 components, `SNSelect`, `SNCombobox`), app migrated (ADR-0028).                                                                                                                                                                                                                                                                                                                                    |
| **WP-M1-16 (part)**   | **DONE**            | Rename and delete chats.                                                                                                                                                                                                                                                                                                                                                                                                    |
| **WP-M1-28**          | **DONE (backend)**  | Members, invitations, ownership transfer (ADR-0029, migration `20261022140000`). UI is WP-M1-29.                                                                                                                                                                                                                                                                                                                            |
| **Extras**            | **DONE**            | @mention pills, Customer chats nav item, glow on Ask Sino inputs, office rooms, favicon/manifest, fixes (Redis lazy connect, run attach race, theme bootstrap (now server HTML insertion), sineva-ai `error_code`, SMTP renderer).                                                                                                                                                                                          |
| **WP-M1-40**          | **DONE (platform)** | Inbox backend: `inbox_items`, `inbox_item_reads`, `approvals`, `approval_revisions`, `input_requests` (migration `20261022170000_inbox_items_and_approvals`), item creation port, list, counts, read, decide, changes, answer, dismiss, expiry job, relay bridge for `approval_required` and `input_required`, internal routes. ADR-0032. Approval contract is proposed by the platform; sineva-ai half (WP-M1-07) blocked. |
| **Hotfix (React 19)** | **DONE**            | Commit `61855a0`: Suppressed React 19 false-positive console error regarding `<script>` tag in `next-themes` (`apps/web/src/client/store/provider.tsx`). Superseded: `next-themes` was removed in WP-M0-37 (compro theme script and `useTheme` replace it), so the console-error suppression is gone too.                                                                                                                   |

---

## 4. Pending integrator actions

- Deployed on the local dev DB: every migration up to `20261022140000_members_invitations_ownership_transfer` (chat_runs, audit_events, message_cards, drop_agent_configs, user_preferences, members). Earlier note: `chat_runs` and `audit_events` deployed to the shared DB; `test:integration` green (5 files, 33 tests) on a throwaway DB, since dropped.
- Gotcha for this local DB: `_prisma_migrations` lives in `public` (the DB was first migrated with a plain URL) while every table is in `platform`. Run `migrate status`/`deploy` with the plain `DATABASE_URL` from `.env`; adding `?schema=platform` makes Prisma look for `platform._prisma_migrations`, see nothing applied and try to re-run `init`. All migration SQL is schema-qualified, so tables still land in `platform`.
- Add `ENTITLEMENTS_MODE=open` to `.env.example`.
- WP-M1-40: deploy migration `20261022170000_inbox_items_and_approvals`; schedule `POST /internal/v1/inbox/expire` (header `X-Internal-Api-Key`) every minute or so, there is no job runner yet.
- Blocked on sineva-ai team: WP-M0-13..20 (v2 contract, SSE, catalog), PII vectors copy, audit publisher.

## 5. Next Tasks (superseded list below kept for history)

1. **WP-M0-30: SSE relay and client stream helper**
   - Route: `/api/v1/workspaces/[workspace_id]/runs/[run_id]/events/route.ts` & cancel route.
   - Use Case: `StreamRunUseCase` connecting browser to BFF to `sineva-ai` streaming with persistence of the final assistant message.
   - Client: `src/client/lib/event_stream.ts`.
2. **WP-M0-31: Specialist registry on the platform and slug migration**
   - Canonical specialists manifest and `GET /api/v1/agents`.
3. **WP-M0-35: Cross-tenant canary suite and CI gate**.
