---
title: "Agent Rules"
category: "governance"
status: "active"
version: "2.1.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "governance", "rules", "ai-agents", "architecture", "process", "contract"]
summary: "Numbered MUST and MUST NOT rules for anyone, human or AI, changing sineva-platform, each with a reason and a concrete check."
related_docs:
  - "README.md"
  - "git_and_pr_workflow.md"
  - "../decisions/README.md"
  - "../development/known_issues_and_tech_debt.md"
  - "../project-structure/clean_architecture_layers.md"
  - "../engineering/testing_strategy.md"
---

# Agent Rules

These rules apply to every change, by a person or an AI coding agent. The root `AGENTS.md` summarizes them and refers to them by number (R-01 and so on). Each rule has a reason and a check you can run or perform. Decisions behind the rules are in [decisions](../decisions/README.md); if a rule and its decision disagree, the decision wins.

"Current" describes what the code does today. "Target" is decided but not yet implemented.

Numbers are stable: other docs cite them. R-39 to R-42 were added after R-38. They sit with their topic group instead of at the end of the file, so the numbers are not strictly sequential on the page.

## Process

### R-01 MUST write the failing test first
Write the test, run it, see it fail for the right reason, then write the code. This applies to every feature and bug fix, including small ones. Do not write production code without a test that drove it.
- **Why**: A test written after the code only describes what the code already does, and a test never seen failing may not test anything.
- **Check**: The PR shows the failing output from before the change. `git log` shows the test in the same or an earlier commit than the code. ([ADR-0007](../decisions/0007-tdd-fakes-integration-containers.md))

### R-02 MUST run the verification commands before calling work done
```bash
npm run lint && npm run typecheck && npm run test && npm run build
```
Also run `npm run test:integration` when database code changed. It needs `TEST_DATABASE_URL`, and the database name must contain "test".
- **Why**: CI runs the same four commands, so a local failure is a CI failure later.
- **Check**: Paste the commands and their results in the PR. Do not claim a pass you did not run.

### R-03 MUST use Conventional Commits
`<type>(<scope>): <subject>`, imperative, lowercase, no trailing period, 72 characters or fewer. Breaking change: `!` plus a `BREAKING CHANGE:` footer. Split unrelated types into separate commits.
- **Why**: A scannable history and a visible breaking-change signal.
- **Check**: `git log --format=%s origin/main..HEAD` and read each line. ([ADR-0009](../decisions/0009-conventional-commits-and-pr-template.md), [git and PR workflow](git_and_pr_workflow.md))

### R-04 MUST open PRs with the full template and evidence
Use every applicable section. Tick a checklist item only with evidence (command output, log, screenshot).
- **Why**: Reviewers verify evidence. They cannot verify a claim.
- **Check**: Each ticked box in the PR links or quotes output.

### R-05 MUST keep edits surgical
Change only what the task needs. Report adjacent problems in the PR notes or an issue. Do not fix them silently.
- **Why**: Unrelated edits hide the real change and break unrelated behavior.
- **Check**: `git diff --stat` touches only files the task explains.

### R-06 MUST ask when the request is ambiguous
State your assumptions. When two readings are plausible, list them and ask. Approval for one change does not cover the next.
- **Why**: A wrong guess costs more than a question, especially for schema, data and contract changes.
- **Check**: The PR or thread names each assumption you made.

## Architecture

### R-07 MUST follow the layer dependency rules
`domain` depends on nothing in `server`. `application` depends only on `domain`. `infrastructure` depends only on `domain`. `http` and `app` sit at the edge. Current: `architecture.test.ts` blocks specific layers and packages, not every possible import, so "only" is partly a review rule.
- **Why**: Swappable adapters and testable use cases depend on inward-only imports.
- **Check**: `npm --workspace=@sineva/web run test -- architecture`. ([ADR-0004](../decisions/0004-web-app-structure-and-dependency-rules.md))

### R-08 MUST NOT import server code from client code
`src/client/**` never imports `@/server/**` or `server-only`. Put types the client needs in `src/shared`.
- **Why**: Server modules carry secrets and Node-only code, and fail or leak in the browser bundle.
- **Check**: `grep -rnE "@/server|server-only" apps/web/src/client` returns nothing. `npm run lint` and `architecture.test.ts` also fail on it.

### R-09 MUST mark server modules with `import 'server-only'`
Every file under `src/server/infrastructure` and `src/server/container.ts` starts with `import 'server-only';`.
- **Why**: A client import of a marked module fails the build instead of leaking.
- **Check**: `architecture.test.ts` ("marks every infrastructure file and the container").

### R-10 MUST construct adapters only in `container.ts`
Use lazy, memoized getters. Do no I/O at import time. Route handlers and pages ask the container for use cases.
- **Why**: `next build` imports every route module. Import-time connections would hit real infrastructure during a build and make tests order-dependent.
- **Check**: `grep -rnE "new [A-Za-z]*(Repository|Gateway)\(" apps/web/src --include=*.ts --include=*.tsx` shows matches only in `server/container.ts`, adapter definitions and tests. `architecture.test.ts` blocks `app` imports of infrastructure.

### R-11 MUST keep route handlers thin
Parse input with Zod, call a use case from `@/server/container`, respond through `server/http/response_helper`. No business logic, no SQL, no adapter imports.
- **Why**: Logic in handlers cannot be unit-tested without HTTP and gets duplicated across routes.
- **Check**: Read the handler: three steps only. `architecture.test.ts` blocks `@/server/infrastructure` imports from `app`, except the static OpenAPI spec.

### R-12 MUST keep the domain pure
No `next`, `react`, ORM, driver or AWS SDK imports. Target: no `@sineva/shared` import either. Current debt: `domain_error.ts` has a type import from `@sineva/shared`. Do not copy it.
- **Why**: The domain must outlive any framework or database choice.
- **Check**: `grep -rn "from '" apps/web/src/server/domain` and read the specifiers. `architecture.test.ts` covers frameworks and ORMs.

### R-13 MUST keep application and infrastructure dependent on the domain only
Use cases and adapters import domain types and ports. Adapters never import use cases or `http`.
- **Why**: The dependency arrow points inward so the domain never learns about adapters.
- **Check**: `architecture.test.ts`, plus review of non-layer imports.

### R-14 MUST keep wire types in `src/shared` and guarded
Browser-facing shapes (for example `AgentView`) live in `src/shared`. A compile-time guard must keep the domain type assignable to the view: `server/http/agent_view_contract.ts` for `AgentView`, `server/http/chat_view_contract.ts` for the chat reply (`chat_view.ts`). Add a guard when you add a shared view.
- **Why**: Backend entity changes would otherwise break the client at runtime.
- **Check**: `npm run typecheck` fails when the entity or chat response drifts from its view.

## Data

### R-15 MUST use Prisma only
No Drizzle, no raw `pg` pools in application code. Prisma code lives in `src/server/infrastructure/database`.
- **Why**: One tool owns schema, migrations and client. ([ADR-0005](../decisions/0005-prisma-replaces-drizzle.md))
- **Check**: `grep -rni "drizzle" apps/web/package.json apps/web/src` matches only the forbidden-import list in `architecture.test.ts`.

### R-16 MUST pin Prisma packages exactly
`prisma`, `@prisma/client` and `@prisma/adapter-pg` are exactly `7.10.1`, with no `^` or `~`. Never install them without an explicit version.
- **Why**: On 2026-10-21 the npm `latest` tag for `prisma` was `8.0.0-rc.23`, a release candidate.
- **Check**: `grep -E '"(prisma|@prisma/[a-z-]+)":' apps/web/package.json` shows `7.10.1` with no range prefix.

### R-17 MUST keep platform tables in the `platform` schema
Every model has `@@schema("platform")`. Never create platform tables in `public`.
- **Why**: `sineva-ai` shares the database and owns its own schema, `sineva_ai`. Neither service writes to `public`. ([ADR-0006](../decisions/0006-shared-postgres-platform-schema.md))
- **Check**: In `apps/web/prisma/schema.prisma`, every `model` block contains `@@schema("platform")`.

### R-18 MUST NOT reset or push against a shared or persistent database
Never run `prisma migrate reset` or `prisma db push` against a shared or persistent DB, and never accept a reset prompt.
- **Why**: Both can drop objects, including data that belongs to `sineva-ai`.
- **Check**: Before any Prisma command, print the target host and database name from `DATABASE_URL`. If it is not a throwaway container, stop.

### R-19 MUST run `migrate dev` only on a throwaway database
Use a plain `DATABASE_URL` there, without `?schema=platform` (see R-42).
- **Why**: `migrate dev` can prompt to reset the database when it detects drift.
- **Check**: The throwaway database is a local container you can delete. Shared and production environments use `prisma migrate deploy` only.

### R-20 MUST commit migration SQL
Every schema change ships with its folder in `apps/web/prisma/migrations/`.
- **Why**: The migration history is how other environments reach the same schema.
- **Check**: A PR that edits `schema.prisma` also adds a migration directory.

### R-21 MUST use `snake_case` tables and columns, with `id` (uuid) as primary key
Map Prisma model names to `snake_case` plural tables with `@@map`. The key rules are in R-39.
- **Why**: Same naming across Postgres, the wire and `sineva-ai`. ([ADR-0003](../decisions/0003-snake-case-wire-contract.md))
- **Check**: Review `schema.prisma`. No camelCase column names, no PK named other than `id`.

### R-22 MUST NOT edit or commit the generated Prisma client
It is built output under `src/server/infrastructure/database/generated`, rebuilt by `npm run db:generate`.
- **Why**: Hand edits are overwritten, and committed output creates noisy diffs.
- **Check**: `git check-ignore apps/web/src/server/infrastructure/database/generated` prints the path. `git status` shows nothing under it.

### R-39 MUST use UUID primary keys named `id`, generated by the database
Every table has `id UUID` with default `gen_random_uuid()` (v4, because Postgres 17 has no native uuidv7). In Prisma: `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`. No prefixed string ids (`usr_...`), no ids generated in application code. Foreign keys are `@db.Uuid` too. `sineva-ai` also uses UUID keys with the same default, but names them after the entity (`session_id`, `agent_id`), so the column name `id` is a platform rule only.
- **Why**: One id format across both services and the wire, with no collisions across tables. ([ADR-0014](../decisions/0014-uuid-primary-keys.md))
- **Check**: In `apps/web/prisma/schema.prisma` every `id` carries `@db.Uuid` and the `gen_random_uuid()` default. In the migration SQL every primary key is `UUID NOT NULL DEFAULT gen_random_uuid()`.

### R-42 MUST deploy migrations with `?schema=platform`
`prisma migrate deploy` against the shared database uses a `DATABASE_URL` that ends in `?schema=platform`. `migrate dev` uses a plain URL on a throwaway database. Migrations are an explicit release step, never part of the Docker `CMD`.
- **Why**: With a plain URL Prisma creates `_prisma_migrations` in `public`, which the platform must not use. With `?schema=platform` the table lands in `platform`, but `migrate dev` then emits unqualified SQL, so that URL form is for `deploy` only. The committed migration SQL is already schema-qualified.
- **Check**: The release step or runbook shows `?schema=platform` on the `migrate deploy` URL. `apps/web/src/__tests__/integration/global_setup.ts` does the same for the test database. ([ADR-0006](../decisions/0006-shared-postgres-platform-schema.md), [ADR-0005](../decisions/0005-prisma-replaces-drizzle.md))

## Contract

### R-23 MUST use `snake_case` JSON keys on the wire
Request bodies, query params, responses and `meta`.
- **Why**: No mapping layer between the web, Postgres and `sineva-ai`. ([ADR-0003](../decisions/0003-snake-case-wire-contract.md))
- **Check**: Review. No test enforces this on routes. `assertSnakeCaseKeys` from `@sineva/shared` checks top-level keys only and only `packages/shared` tests call it; the route tests do not. Known debt API-7 in [known issues](../development/known_issues_and_tech_debt.md).

### R-24 MUST build responses with `response_helper`
Use the helpers that wrap `createSuccessResponse`, `createPaginatedResponse` and `createErrorResponse`. Never hand-build the envelope.
- **Why**: Clients depend on one shape for success, pagination and errors.
- **Check**: `grep -rn "NextResponse.json" apps/web/src/app` shows only the raw OpenAPI document route.

### R-25 MUST register new routes in the OpenAPI spec
Add the path and schemas in `src/server/infrastructure/openapi/spec.ts`.
- **Why**: `/api/openapi.json` and `/api-docs` are the API catalog.
- **Check**: `src/__tests__/openapi_guard.test.ts` fails when a route file or exported method has no spec entry, and when a spec path has no route file. It does not check that a schema matches its Zod DTO, so read the entry before you open the PR.

### R-40 MUST keep the sineva-ai contract fixtures in sync, byte for byte
`sineva-ai` owns the internal chat contract (`ChatRequestDTO`, `ChatResponseDTO` and its success envelope). The platform gateway adapts to it. The files in `apps/web/src/__tests__/contract/fixtures/` are copies of `sineva-ai/tests/contract/fixtures/`. Never edit a copy. Change the fixture in `sineva-ai` first, copy it here in the same change, and open the matching change in both repos.
- **Why**: A hand-edited copy makes the contract test pass against a shape sineva-ai does not send. ([ADR-0015](../decisions/0015-sineva-ai-owns-internal-chat-contract.md))
- **Check**: `diff -r ../sineva-ai/tests/contract/fixtures apps/web/src/__tests__/contract/fixtures` shows only the platform's own `README.md`. `npm run test` passes the contract tests.

## Reliability and security

### R-26 MUST NOT hide failures
No empty `catch`, no fabricated data, no silent fallback. Adapters throw domain errors.
- **Why**: A fake success hides outages and corrupts user-visible results. ([ADR-0008](../decisions/0008-no-silent-fallbacks.md))
- **Check**: `grep -rnE "catch *(\([^)]*\))? *\{ *\}" apps/web/src` finds single-line empty catches. A `catch` whose only content is a comment is also empty, so read every `catch` you add. Each one handles or rethrows.

### R-27 MUST NOT take identity from the request body in new code
Do not trust `user_id` or `workspace_id` sent by the client for access decisions. Current known gap: no authentication exists, and `chat` and `presign` accept both from the body. Do not extend that pattern. Derive identity server-side once authentication exists, and flag any new route that needs it.
- **Why**: A client can claim any identity.
- **Check**: New handlers read identity from a server-side source, not from the parsed body.

### R-28 MUST NOT add hardcoded secret defaults or expose secrets
No new fallback credentials in code or compose files. No secret in a `NEXT_PUBLIC_*` variable.
- **Why**: Defaults leak into production, and `NEXT_PUBLIC_*` values ship to the browser. Current debt: `getEnvConfig()` and `docker-compose.yml` already hold dev defaults.
- **Check**: `grep -rn "NEXT_PUBLIC_" apps/web docker-compose.yml .env.example` lists only non-secret URLs. Review every new `??` default on an env variable.

### R-29 MUST reach `sineva-ai` only internally
Use the `AiEngineGateway` over `sineva_internal` with `X-Internal-Api-Key`. The platform env variable is `AI_ENGINE_INTERNAL_API_KEY` and the `sineva-ai` one is `INTERNAL_API_KEY`; compose passes the same value to both. Never publish `sineva-ai` ports or call it from the browser.
- **Why**: The platform is the only public entry. ([ADR-0001](../decisions/0001-bff-gateway.md), [ADR-0013](../decisions/0013-internal-service-auth-header.md))
- **Check**: `docker-compose.yml` has `expose` and no `ports` for `sineva-ai`. `grep -rn "X-Internal" apps/web/src` shows `X-Internal-Api-Key` in code. The legacy `X-Internal-Service-Token` appears only in the contract test that asserts it is not sent.

### R-41 MUST turn upstream failures into typed 502 or 503 errors
When `sineva-ai` answers with a non-2xx status or a body that fails the Zod envelope check, the gateway throws `UpstreamServiceError` (502, code `UPSTREAM_ERROR`). When it cannot be reached (network error, timeout, abort), it throws `UpstreamUnavailableError` (503, code `UPSTREAM_UNAVAILABLE`). Messages are client-safe; the upstream status and a truncated body are logged server-side only. Never return a canned reply, never retry silently, and never map these to 500 or 200.
- **Why**: Callers and the UI must tell "the engine answered badly" from "the engine is down", and neither may look like a real reply. ([ADR-0016](../decisions/0016-upstream-failures-return-502-503.md), [ADR-0008](../decisions/0008-no-silent-fallbacks.md))
- **Check**: `internal_ai_engine_gateway.contract.test.ts` (under `apps/web/src/__tests__/contract/`) covers non-2xx, invalid bodies and network failure, and `api_routes.test.ts` covers the 503 response. A new adapter that calls another service follows the same split and gets the same tests.

## Frontend

### R-30 MUST use semantic design tokens, never raw hex
Reference CSS variables such as `--color-surface` and `--color-text`.
- **Why**: Tokens carry light and dark themes.
- **Check**: `grep -rnE "#[0-9a-fA-F]{3,8}\b" apps/web/src/client` returns nothing. See [design tokens](../design-context/design_tokens.md).

### R-31 MUST give new routes loading, error and not-found states
Add `loading.tsx`, `error.tsx` and `not-found.tsx` as the route needs them.
- **Why**: A screen that only works on the happy path is unfinished.
- **Check**: The route segment contains the files. Current gap: none exist under `src/app` yet.

### R-32 MUST meet the WCAG 2.2 AA baseline
Keyboard access, visible focus, AA contrast, and `prefers-reduced-motion` support. The 44x44 px minimum touch target is a project rule. It is not an AA requirement: WCAG 2.2 SC 2.5.8 (Target Size, Minimum, Level AA) asks for 24x24 CSS px. Keep 44 px anyway.
- **Why**: Accessibility is a baseline, and the stricter project target reduces mis-taps.
- **Check**: Tab through the screen. Test both themes. Source for 2.5.8: <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>.

## Product and docs

### R-33 MUST follow the wording rules in user-facing copy
Sino is a "companion" (ID: "teman kerja", "teman AI"). Never "chatbot", "assistant", "asisten" or "agent" in copy a customer reads. Code identifiers and `/api/v1/agents` keep "agent".
- **Why**: Consistent positioning. ([ADR-0011](../decisions/0011-user-facing-wording.md))
- **Check**: `grep -rniE "chatbot|assistant|asisten" apps/web/src/client apps/web/src/app` and read each hit that is user-visible.

### R-34 MUST respect product guardrails
SinoPeople never hires or rejects. SinoSales proposals and SinoSocial posts stay drafts until a person approves. SinoFinance never moves money. SinoInsights is read-only. SinoHelp auto-replies to routine questions within user-set rules and escalates new, sensitive or uncertain ones to a person.
- **Why**: These limits are the product's promise. ([ADR-0012](../decisions/0012-canonical-product-slugs-and-guardrails.md))
- **Check**: No code path or copy lets a product act outside its guardrail. Review new features against this list.

### R-35 MUST describe integrations generically
Write "the tools you already use". Do not name specific platforms in user-facing copy.
- **Why**: Naming platforms implies supported integrations that may not exist.
- **Check**: Read new copy for platform names.

### R-36 MUST write @mentions as `@SinoHelp …` with no comma
- **Why**: One chat, products called by mention. ([ADR-0010](../decisions/0010-one-chat-with-mentions.md))
- **Check**: Review. `grep -rnE "@Sino[A-Za-z]+," apps/web/src` finds candidates, but it also matches a comma-separated list of handles, which is fine. Read each hit: only a comma directly after a mention that starts a message breaks the rule.

### R-37 MUST use the canonical product slugs
`sinopeople`, `sinofinance`, `sinosales`, `sinosocial`, `sinohelp`, `sinoinsights`. Not `sino-*`, not `sino_*`. SinoMoney is SinoFinance.
The orchestrator slug in `sineva-ai` is `sino`. Handles keep their casing (`@SinoFinance`).
- **Why**: A slug is a routing key shared with `sineva-compro` and `sineva-ai`, and `sineva-ai` has migrated to the canonical slugs. A database seeded earlier with `sino-*` slugs keeps those rows after a re-seed (the seed upserts by slug), so it needs a manual or data migration. ([ADR-0012](../decisions/0012-canonical-product-slugs-and-guardrails.md))
- **Check**: `grep -rnE "sino[-_](people|finance|sales|social|help|insights)|SinoMoney|sino[-_]?money" apps docs` returns only text that discusses the old names.

### R-38 MUST update docs in the same change
A change to behavior, structure, a command or a decision updates the affected doc, and the index if you add or move one.
- **Why**: Docs that lag the code mislead the next reader and the next agent.
- **Check**: The diff includes the doc edits, and `docs/README.md` links resolve.

## Known debt: do not copy these patterns

These exist today and break the rules above. Do not extend them. Details and removal status: [known issues and tech debt](../development/known_issues_and_tech_debt.md).

- `user_id` and `workspace_id` taken from request bodies, with no authentication. Breaks R-27.
- `@sineva/shared` type import in `domain/errors/domain_error.ts`, and domain errors that carry an HTTP status. Breaks R-12 (Target).
- No `loading.tsx`, `error.tsx` or `not-found.tsx` yet. Breaks R-31.

Removed since the first version of this list: the canned AI reply on `sineva-ai` failure (now R-41), the in-memory agent registry (Prisma repository is wired in `container.ts`), the `X-Internal-Service-Token` header, the old `sino-*` slugs in gateway playbooks, upstream 4xx/500 masked body logging and request id propagation (WP-M0-07), truthful infrastructure probes (Postgres SELECT 1, Redis ping, S3 HeadBucket, sineva-ai health version), typed 502 on presign failure, S3 public endpoint presigning host, and real ioredis cache repository with prefix invalidation (WP-M0-08), and validated secrets without fallback defaults in production, bounded `AI_ENGINE_TIMEOUT_MS`, security headers, and CSRF protection baseline (WP-M0-09).
