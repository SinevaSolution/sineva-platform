---
title: 'Checkpoint Resume Batch, 22 October 2026'
category: 'development'
status: 'active'
version: '1.0.0'
last_updated: '2026-10-22'
owner: 'Sineva Engineering'
tags: ['checkpoint', 'integration', 'members', 'inbox', 'library', 'onboarding']
summary: 'Integration evidence, implemented screens, runtime fixes and acceptance work still required for the checkpoint continuation.'
related_docs:
  - 'README.md'
  - '../api-spec/onboarding_and_business_profile_endpoints.md'
  - '../api-spec/inbox_and_approvals_endpoints.md'
  - '../api-spec/library_endpoints.md'
---

# Checkpoint resume batch

## Integrated backend branches

PR #1 was confirmed merged before work began. The three clean saved branches were merged into `feat/m0-platform` without changing their worktrees:

| Work                            | Saved head | Integration commit |
| :------------------------------ | :--------- | :----------------- |
| Inbox and approvals             | `7f4a510`  | `4ed6d85`          |
| Library                         | `435dcaa`  | `c09fcdc`          |
| Business Profile and onboarding | `0b8ab41`  | `44f586d`          |

Shared schema relations, container getters, permission keys, OpenAPI paths and documentation indexes retain the members work and all three new backends. The incomplete onboarding branch needed OpenAPI and route policy registrations, corrections to its route test's response-envelope assertion and handler typing, and the Library ingest-event schema marker retained during the schema union. The two-screen member welcome now records completion and its audit event; a regression test failed before the fix.

## Implemented screens

| Route                                   | Current behavior                                                                                                                                                                                                                                         |
| :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/w/{slug}/settings/members`            | Role-filtered directory, invitations, copied links, resend/revoke, member roles and specialist scope, removal, leave and ownership transfer. Sensitive operations can request password reauthentication.                                                 |
| `/invite/{token}`, `/ownership/{token}` | Server-loaded public preview, explicit acceptance, inactive links, account mismatch and sign-in/sign-up return links. OAuth and email verification retain the invitation return path.                                                                    |
| `/w/{slug}/inbox`                       | Server-loaded list/detail, first nonempty default tab, tab counts, URL-selected item/page, draft review/edit/reject/changes, input answers, read state and revision history. Mobile detail hides the list and provides a return action.                  |
| `/w/{slug}/library`                     | Server-loaded documents and folders, search/status/folder URL state, file or note creation, extracted text preview, document metadata/scope/review edits, reindex, deletion confirmation and scoped retrieval checks. Usage counts are owner/admin only. |
| `/onboarding`                           | Explicit first-workspace creation for a verified account with no workspace; pending invitations and duplicate submissions are handled. Root no longer ends at a non-actionable no-workspace page.                                                        |
| `/w/{slug}/onboarding`                  | Saved owner steps, required language/business name, optional links/goals, profile confirmation and three first tasks. The member flow has two steps. A task opens a visible draft message for review.                                                    |
| `/w/{slug}/settings/business`           | Profile editing with version checks, voice samples, product/service and policy CRUD, website suggestions with evidence, explicit adoption/save, historical snapshot review and restore. Members/viewers read only.                                       |

New segments have loading, error and not-found entries. The settings index links to shipped screens. Inbox and Library no longer carry a Soon marker. The shell badge uses the same counts use case as `GET .../inbox/counts`; refreshing after an action reloads it. Server page reads use current database membership and specialist scope. The shell is keyed by workspace id so its local state and recent-chat list remount on workspace switches.

Uploads compute SHA-256, request a ticket, send bytes with its exact headers and no app credentials, then call completion. A storage failure never calls completion. Documents remain queued until sineva-ai confirms readiness. Metadata edits preserve existing multiple scopes unless the scope itself is changed.

## Library upload dropzone

Library now uses the reusable `SNDropzone` from `@sineva/ui` in its upload dialog. The component supports keyboard browsing, drag-and-drop, selected file names, disabled state and format/size/count errors supplied by the caller. Library accepts files up to 25 MB using its existing extension allowlist and upload ticket/PUT/completion flow, with multiple file selection enabled.

Dropzone component tests (`sn_dropzone.test.tsx`) and the Library component suite (`library_ui.test.tsx`) pass locally. A companion gallery exists; browser acceptance remains open. The Library screen also features:

- Usage and quota drawer (`SNDrawer`) presenting documents, storage, and monthly OCR usage limits.
- Folder rename and move dialogs wired to `PATCH /folders/{id}`.
- Detailed reason codes mapping and flagged page numbers presentation for `needs_attention` and `failed` documents.
- Reading progress row with `SNProgressBar` for documents in `processing` status.
- Scope, source type, and language filter controls wired to URL query params.

### Inbox UI enhancements (WP-M1-41 partial)

- `InboxScreen` master list with full row summaries, unread indicators, specialist badges, and localized source indicators.
- Specialist filter and a source dropdown. Source filtering currently applies only to the loaded page; repository/API filtering and date filtering remain open.
- Keyboard navigation shortcuts (`j` and `k` navigation across list items).
- Edited-draft diff view with toggle (`show_diff` / `hide_diff`) and visual distinction of added/removed content.
- Expired item state presentation with "Draft again" link returning to source chat.
- Component coverage in `inbox_ui.test.tsx`; browser/mobile acceptance remains open.

### Members UI enhancements (WP-M1-29 partial)

- Member detail drawer (`MemberDetailDrawer`) built on `SNDrawer` with role, email, and specialist permission management.
- Separate `InviteDialog` (`SNDialog`) for inviting new workspace members.
- Sensitive operation reauthentication flow (`SNConfirmDialog` + password re-auth dialog) and cancellation of ownership transfer.
- Component coverage in `member_pages.test.tsx`; browser journeys and OAuth-only reauthentication acceptance remain open.

## React runtime fixes

- `4fe4b5a`: `FieldContext`, `SNField` and the stateful fallback card have explicit client boundaries. The new boundary guard initially failed, then passed alongside the field controls (73 tests).
- `a0171b0`: theme bootstrap uses `useServerInsertedHTML`, inserts once with the request nonce and returns null in the hydrated client tree. The installed Next.js 16.4 `next/script` implementation returns a raw script for inline `beforeInteractive`; this was the source of the reported client warning. Three tests cover an empty client tree, server insertion, nonce forwarding and single insertion. No console suppression was added.

## Verification evidence

- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`: passed during the batch; final command summaries are recorded in the PR.
- Web unit/route/contract suite: 2,055 passed, one existing skip before the final documentation-only pass.
- `TEST_DATABASE_URL=postgresql://test:test@localhost:55433/sineva_resume_test npm run test:integration`: 12 files, 128 tests passed. All 15 committed migrations deployed to this disposable PostgreSQL 17 container. The persistent development database was not used by these tests.
- Cross-tenant route canary: 71 workspace route/method combinations return 404 before any container access. The inventory includes the new M1 routes. Three assertions also check discovery and demonstrate that status, body or adapter-access mutations fail the canary. CI explicitly runs this lane in addition to the whole unit suite.
- No local dev server was started. Component browser checks now pass against a disposable production image on port 3301, which was stopped after verification. The 36 scenarios cover the initial button matrix/axe, keyboard dropzone and pseudo-locale/text zoom. Workspace authentication, members, Inbox, Library and onboarding browser journeys remain unverified. These fixture checks do not close the full visual acceptance gate.

## Acceptance work still open

These screens are a functional implementation batch, not completion of every design-spec acceptance item:

- WP-M1-29: the full invitation/ownership browser journey with mailbox and OAuth fakes; matrix screenshots and axe. OAuth-only fresh-session recovery still needs its dedicated UX.
- WP-M1-41: server-side source/date filtering, full detail ordering and edited-title comparison, real expired draft-again behavior and mobile sticky actions/sheets. Row summaries, specialist filtering, body comparison and j/k navigation exist. Current backend filters support tab and specialist only.
- WP-M1-33: nested folder tree, DataTable/server sort, full metadata/detail/scope/mobile presentation and browser/ingest acceptance. Multiple upload selection, per-file status/retry, rename/move dialogs, URL filters, reason codes/pages and the usage drawer now exist.
- WP-M1-38: About you, team size/province and scan review inside the wizard, field-by-field provenance and the complete mobile journey. Website review is currently in Business Profile; the manual wizard works independently.
- WP-M0-35: the route lane exists. Real repository canaries for every resource, actual repository-filter mutation and the sineva-ai/Qdrant lane remain. Repository branch protection still needs the canary check made required by a maintainer. The current meta-test mutates the assertion inputs, not a production repository.
- WP-M0-41 is now partial: `/dev/ui`, 33 primitive entries, production gate, Playwright/axe dependencies and browser CI are implemented. Browser execution, approved baselines, all fixture states/locales, pattern galleries and full axe/matrix acceptance remain. WP-M0-43 through 47 screen audits and the final integration gate remain. Do not mark M0 complete.
- The proposed `approval_*.json`, `library_*.json` and `scan_*.json` contracts are locally documented and tested. No sineva-ai files were edited. Acceptance and the cross-repository integration document belong to that team under the checkpoint's platform-only scope.

## Local release and remaining prerequisites

The Founder explicitly approved the persistent local release on 2026-10-22. On `localhost:5432/sineva_platform` (`sineva_user`, container `sineva-postgres`), the release moved `_prisma_migrations` from `public` to `platform` in a transaction and ran Prisma 7.10.1 `migrate deploy` with `?schema=platform`. All three pending migrations applied successfully. The final `migrate status` reports up to date, and SQL confirms that all 15 history entries succeeded and the history table exists only in `platform`. Existing row counts remained 2 users, 2 workspaces and 1 conversation. The release used no reset or seed.

Applied migration prefixes: `20261022150000`, `20261022160000`, `20261022170000`. SQL confirms the new Library, Business Profile/onboarding and Inbox tables exist. Future status/deploy commands must use `?schema=platform`. Workspace browser journeys remain unverified.

Other prerequisites remain: storage CORS for app-origin PUT, Founder-managed `.env.example` addition of `ENTITLEMENTS_MODE=open`, and an authenticated scheduler calling `POST /internal/v1/inbox/expire` every minute. This batch does not install a scheduler or change the environment file.

## Plan reconciliation and follow-up implementation

See [implementation plan alignment](implementation-plan-alignment-2026-10-22.md) for the current WP statuses and dependency order. The continuation adds a per-file upload queue that continues after errors and retries only failed rows, preserves Inbox list cursors and avoids hijacking browser/dialog keyboard shortcuts, and starts the gated component browser harness. The [Node security report](../deployment/node-security-2026-10-22.md) records CVE-2026-111497 remediation and its deployment limits.

### Current continuation verification

- Node 24.22.1 locally and in the built non-root application image; old 24.21.0 fails the runtime guard.
- Final full unit/route/contract suite: web 2,091 passed/one existing skip; UI 548 passed. Shared: 132 passed/one existing skip. Card schemas: 45 passed/one existing skip. The upload-session and Library UI suites pass together (18 tests).
- Root lint, typecheck and build pass; the bundle report finds no heavy library in the shared client chunk.
- Browser suite: 36 passed on the disposable production image. Its initial 12 dark-theme failures exposed the danger foreground contrast bug; the new app-only token fixes it, and 154 button/token tests pass. No local screenshots were committed as baselines.
- Production `/dev/ui` without `ENABLE_DEV_UI=1`: HTTP 404. Temporary app containers were stopped.
- No database migration or backend query changed in this continuation, so the earlier disposable-database integration evidence remains historical and is not presented as a new run.

## Pause and delivery

The Founder paused feature work and requested a commit, PR to `main` and merge on 2026-10-22. `CHECKPOINT.md` section 0 contains the next-session instructions. PR #2 carries this batch; use its final checks and merge commit as delivery evidence. Temporary browser-test application containers have been stopped.
