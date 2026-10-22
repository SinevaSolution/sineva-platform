---
title: "Testing Strategy"
category: "engineering"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "testing", "tdd", "vitest", "contract-tests", "integration-tests", "ci"]
summary: "The test layers as implemented in sineva-platform, how to run each, what counts as red evidence for TDD, and what CI runs today versus the target."
related_docs:
  - "database_migrations_workflow.md"
  - "database_conventions.md"
  - "error_handling_and_failure_modes.md"
  - "coding_standards.md"
  - "../deployment/ci_cd_pipeline.md"
  - "../decisions/0007-tdd-fakes-integration-containers.md"
  - "../decisions/0015-sineva-ai-owns-internal-chat-contract.md"
  - "../governance/agent_rules.md"
---

# Testing Strategy

TDD is mandatory ([ADR-0007](../decisions/0007-tdd-fakes-integration-containers.md), R-01). This page describes the test layers that exist, what each one is for and how to run it. "Current" is what the repo does today; "Target" is decided but not built.

Tooling: Vitest (`vitest run`), Node environment, `globals: true`. Configs live in `apps/web/vitest.config.ts` (unit) and `apps/web/vitest.integration.config.ts` (integration). Tests sit under `apps/web/src/__tests__/`; `@sineva/shared` has its own test in `packages/shared/src/response.test.ts`.

## The layers

| Layer | Where | What it proves | Needs |
| :--- | :--- | :--- | :--- |
| Unit, with fakes | `use_cases.test.ts`, `adapters.test.ts`, `store.test.ts`, `fakes/` | Use-case logic and store slices, with no infrastructure | nothing |
| Architecture | `architecture.test.ts` | Layer and client/server import rules, and `server-only` markers | nothing |
| Contract | `contract/internal_ai_engine_gateway.contract.test.ts`, `contract/fixtures/` | The gateway sends and accepts exactly what `sineva-ai` defines | nothing (stubbed `fetch`) |
| Route | `api_routes.test.ts` | Each route handler: Zod parse, use case, envelope, `snake_case` keys, status codes | nothing |
| Design system | `packages/ui/src/__tests__/` (`ui-tokens`, `lint_rules`, `structure`, `theme`), `apps/web/src/__tests__/design_tokens_wiring.test.ts`, `design_lint_client.test.ts`, `bundle_report.test.ts` | Vendored tokens equal the compro snapshot, contrast in both themes and for the 13 accent ramps, z-index order, each design lint rule fails its fixture, package layout, theme script, wiring of tokens, fonts and theme in the app | nothing (Testing Library and jsdom for component tests) |
| Integration | `integration/*.int.test.ts` | Prisma adapters against a real Postgres with the real migrations | a throwaway Postgres |

The first four run in `npm run test` and need no Docker. Integration tests run separately in `npm run test:integration` so the normal suite never needs a database.

### Unit tests with fakes

Use cases take ports, so tests hand them in-memory fakes from `src/__tests__/fakes/`: `fake_agent_repository.ts`, `fake_ai_engine_gateway.ts`, `fake_cache.ts`, `fake_storage.ts`. The fake gateway records the requests it receives and throws `failure` when set, the way the real adapter throws a domain error. A fake is only worth something while it behaves like the real adapter. When a port changes, update the fake and the integration test in the same change.

### Architecture test

`architecture.test.ts` reads source files, strips comments, extracts import specifiers (static, side-effect, re-export, dynamic and `require`) and asserts:

- the layered directories exist and the legacy top-level layers (`src/domain`, `src/application`, `src/infrastructure`, `src/presentation`) do not;
- `src/client` never imports `@/server` or `server-only`;
- `domain` imports no `application`, `infrastructure`, `http`, `next`, `react` or ORM, driver and AWS packages;
- `application` imports no `infrastructure`, `http`, `next` or `react`;
- `infrastructure` imports no `application` or `http`;
- every file under `server/infrastructure` (except the generated Prisma client) and `server/container.ts` starts with `import 'server-only'`;
- `src/app` imports `@/server/infrastructure` only for `openapi`.

It blocks specific layers and packages, not every possible import, so some of R-07 stays a review rule.

### Contract tests

`sineva-ai` owns the internal chat contract ([ADR-0015](../decisions/0015-sineva-ai-owns-internal-chat-contract.md), R-40). The contract test stubs `fetch` and checks the gateway against two fixtures, `chat_request.json` and `chat_response_envelope.json`. They are copies of `sineva-ai/tests/contract/fixtures/`, byte for byte (compared with `cmp` while writing this page). Never edit a copy. Change the fixture in `sineva-ai` first, copy it here in the same change and update both repos together. `fixtures/README.md` is the platform's own file.

What the test covers: the `X-Internal-Api-Key` header and the absence of the old token header, the exact request keys (`user_message`, `session_id`, `user_id`, `context_metadata`; no `tenant_id` yet), the slug URL-encoded in the path only, omitted optionals, the configured timeout, mapping of a full success envelope, non-2xx, non-JSON and invalid bodies to `UpstreamServiceError` (502), network failure and timeout to `UpstreamUnavailableError` (503), no leak of the internal key into logs, tolerance of additive fields, and the health call.

### Route tests

`api_routes.test.ts` calls the exported route functions (`GET`, `POST`) with `NextRequest` objects. The real container would build Postgres, Redis and S3 adapters, so the file replaces it:

- `vi.mock('@/server/container', ...)` returns use cases built from fakes;
- the factory can only reach a holder created with `vi.hoisted`, because `vi.mock` is hoisted above the imports;
- `beforeEach` fills the holder with fresh fakes so tests cannot see each other's writes.

This is the only place the suite uses `vi.mock`, and only for the container. Everywhere else, tests build objects with fakes and pass them in. There is no container reset hook; do not add one.

### Integration tests

`integration/prisma_agent_repository.int.test.ts` runs `PrismaAgentRepository` against a real database. Its rows are inserted through Prisma directly, not through the repository under test, so reads are checked against data the adapter did not shape.

How the setup keeps this safe:

1. `integration/global_setup.ts` requires `TEST_DATABASE_URL` and throws if it is unset.
2. It refuses to continue unless the database name matches `/test/i`. A URL ending in `/sineva_platform` fails with `Refusing to run: database "sineva_platform" does not look like a test database`. Gotcha: the check looks at the database name only, not the host. A production host with a database called `something_test` would pass. Point the variable at a local container, always.
3. It runs `npx prisma migrate deploy` against that database with `?schema=platform` added, so tests run on the real committed migrations ([migrations workflow](database_migrations_workflow.md)).
4. `integration/reset_database.ts` truncates all six `platform` tables (`CASCADE`) before every test and once more after the last, so each test starts empty and leaves nothing behind.
5. `fileParallelism: false`, because every test truncates the same tables.

## Running tests

From the repo root:

```bash
npm run test                 # unit, architecture, contract, route tests; every workspace, via turbo
npm run test:integration     # needs TEST_DATABASE_URL; runs prisma generate first
npm --workspace=@sineva/web run test -- architecture     # one file by name filter
```

From `apps/web`, one file: `npx vitest run src/__tests__/use_cases.test.ts`.

`npm run test` depends on `^build` in `turbo.json`, which builds the workspace packages first. `test:integration` is not cached and passes `TEST_DATABASE_URL` through turbo's environment allow-list.

### Starting the throwaway database

```bash
docker run --rm -d --name sineva-pg-scratch \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=sineva_platform_test \
  -p 55432:5432 postgres:17-alpine
export TEST_DATABASE_URL=postgresql://test:test@localhost:55432/sineva_platform_test
npm run test:integration
docker stop sineva-pg-scratch
```

The URL shape comes from the setup's own error message. If you also run `migrate dev`, use a second database for it; the reason is in the [migrations workflow](database_migrations_workflow.md). Port 55432 is chosen to stay clear of the compose Postgres on 5432.

### The `server-only` alias

The `server-only` package throws when imported outside a React Server Components build. Vitest runs plain Node, so both configs alias it to `src/__tests__/stubs/server_only.ts`, an empty module. Without the alias every test that touches `server/infrastructure` or the container fails on the guard import. Keep the alias in both `vitest.config.ts` and `vitest.integration.config.ts`. If a new Vitest config appears, it needs the alias too.

## TDD in practice

1. Write the test. Run it. It must fail for the reason you expect: an assertion about the missing behavior, not a typo, an import error or a missing file.
2. Keep the failing output. The PR shows it (R-01, R-04). Paste the command and the failure line, not a description of it.
3. Write the smallest change that passes. Run the test again and keep that output too.
4. For a bug fix, reproduce the bug in a test first. A fix with no failing test has no proof it fixed anything.
5. For database code, the red test is an integration test. Before the migration exists it fails with a missing relation or column; after, it passes ([workflow](database_migrations_workflow.md)).
6. In history, the test lands in the same commit as the code or an earlier one.

Done means `npm run lint && npm run typecheck && npm run test && npm run build`, plus `npm run test:integration` when database code changed (R-02).

## What CI runs

Current (`.github/workflows/ci.yml`, Node 24, `npm ci`): `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, on pushes and pull requests to `main` and `develop`. There is no Postgres in CI, so integration tests do not run there. The step is named "Run Unit & Integration Tests" but runs only `npm run test`, which excludes `src/__tests__/integration/`. A database change can therefore pass CI without its integration test ever running, so run `npm run test:integration` locally and report the result in the PR.

Target: a CI job with a Postgres service whose database name contains `test`, `TEST_DATABASE_URL` pointing at it, and `npm run test:integration` as a step. Until it exists, the local run is the only gate.

## Not covered today

- No component or browser tests. `@testing-library/react` and `jsdom` are installed, but no test uses them; `store.test.ts` tests the Redux slices only.
- No coverage threshold is configured.
- No test reaches a real Redis, SeaweedFS or `sineva-ai`. The cache and storage adapters are thin, and their known gaps are listed in [error handling and failure modes](error_handling_and_failure_modes.md).
