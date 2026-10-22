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

## React runtime fixes

- `4fe4b5a`: `FieldContext`, `SNField` and the stateful fallback card have explicit client boundaries. The new boundary guard initially failed, then passed alongside the field controls (73 tests).
- `a0171b0`: theme bootstrap uses `useServerInsertedHTML`, inserts once with the request nonce and returns null in the hydrated client tree. The installed Next.js 16.4 `next/script` implementation returns a raw script for inline `beforeInteractive`; this was the source of the reported client warning. Three tests cover an empty client tree, server insertion, nonce forwarding and single insertion. No console suppression was added.

## Verification evidence

- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`: passed during the batch; final command summaries are recorded in the PR.
- Web unit/route/contract suite: 2,055 passed, one existing skip before the final documentation-only pass.
- `TEST_DATABASE_URL=postgresql://test:test@localhost:55433/sineva_resume_test npm run test:integration`: 12 files, 128 tests passed. All 15 committed migrations deployed to this disposable PostgreSQL 17 container. The persistent development database was not used by these tests.
- Cross-tenant route canary: 71 workspace route/method combinations return 404 before any container access. The inventory includes the new M1 routes. Three assertions also check discovery and demonstrate that status, body or adapter-access mutations fail the canary. CI explicitly runs this lane in addition to the whole unit suite.
- No dev server was started. A check of port 3001 found no listener, so browser rendering, hydration, keyboard and screenshots remain unverified. A successful build is not evidence of those behaviors.

## Acceptance work still open

These screens are a functional implementation batch, not completion of every design-spec acceptance item:

- WP-M1-29: member detail drawer and the full invitation/ownership browser journey with mailbox and OAuth fakes; matrix screenshots and axe. OAuth-only fresh-session recovery still needs its dedicated UX.
- WP-M1-41: full row summaries, specialist/source/date filters, j/k navigation, edited-draft diff, expired draft-again action and the complete mobile sheets. Current backend filters support tab and specialist only.
- WP-M1-33: multi-file dropzone/progress rows, nested folder tree with rename/move, scope/source/language filter controls, detailed reason-code/page-number presentation and the quota drawer. Current API already supports the extra document filters and folder mutations.
- WP-M1-38: About you, team size/province and scan review inside the wizard, field-by-field provenance and the complete mobile journey. Website review is currently in Business Profile; the manual wizard works independently.
- WP-M0-35: the route lane exists. Real repository canaries for every resource, actual repository-filter mutation and the sineva-ai/Qdrant lane remain. Repository branch protection still needs the canary check made required by a maintainer. The current meta-test mutates the assertion inputs, not a production repository.
- WP-M0-41 and WP-M0-43 through 47: gallery, Playwright/axe/screenshot infrastructure, full shell/auth/settings audits and the final integration gate remain. Do not mark M0 complete.
- The proposed `approval_*.json`, `library_*.json` and `scan_*.json` contracts are locally documented and tested. No sineva-ai files were edited. Acceptance and the cross-repository integration document belong to that team under the checkpoint's platform-only scope.

## Local release and remaining prerequisites

The Founder explicitly approved the persistent local release on 2026-10-22. On `localhost:5432/sineva_platform` (`sineva_user`, container `sineva-postgres`), the release moved `_prisma_migrations` from `public` to `platform` in a transaction and ran Prisma 7.10.1 `migrate deploy` with `?schema=platform`. All three pending migrations applied successfully. The final `migrate status` reports up to date, and SQL confirms that all 15 history entries succeeded and the history table exists only in `platform`. Existing row counts remained 2 users, 2 workspaces and 1 conversation. The release used no reset or seed.

Applied migration prefixes: `20261022150000`, `20261022160000`, `20261022170000`. SQL confirms the new Library, Business Profile/onboarding and Inbox tables exist. Future status/deploy commands must use `?schema=platform`. Browser behavior remains unverified.

Other prerequisites remain: storage CORS for app-origin PUT, Founder-managed `.env.example` addition of `ENTITLEMENTS_MODE=open`, and an authenticated scheduler calling `POST /internal/v1/inbox/expire` every minute. This batch does not install a scheduler or change the environment file.
