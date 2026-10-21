---
title: "ADR-0007: TDD with fakes and integration tests on throwaway containers"
category: "decisions"
status: "active"
version: "1.1.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "testing", "tdd", "vitest", "integration"]
summary: "Test-driven development is mandatory; unit tests use in-repo fakes, and database adapters get integration tests against a throwaway Postgres container."
related_docs:
  - "0004-web-app-structure-and-dependency-rules.md"
  - "0006-shared-postgres-platform-schema.md"
  - "../engineering/testing_strategy.md"
  - "../deployment/ci_cd_pipeline.md"
adr_id: "0007"
decision_status: "Accepted"
supersedes: []
---

# ADR-0007: TDD with fakes and integration tests on throwaway containers

## Status

Accepted (2026-10-21). The integration setup is implemented.

## Context

The platform has layers with clear ports ([ADR-0004](0004-web-app-structure-and-dependency-rules.md)), which makes use cases testable without infrastructure. Adapters, especially the Prisma ones, can only be proven against a real database. Code without a test that drove it has no recorded reason to exist and no guard against regression.

## Decision

1. TDD is mandatory for every feature and bug fix, with no exception for small changes. Write the failing test first, run it, see it fail for the right reason, then write the implementation. The failing output is evidence and goes in the pull request ([ADR-0009](0009-conventional-commits-and-pr-template.md)).
2. Unit tests use fakes from `apps/web/src/__tests__/fakes/` (`fake_agent_repository.ts`, `fake_ai_engine_gateway.ts`, `fake_cache.ts`, `fake_storage.ts`). They never touch real infrastructure: no Postgres, Redis, S3 or `sineva-ai`.
3. Prisma adapters have integration tests against a throwaway Postgres container. They run with `npm run test:integration`, which uses `apps/web/vitest.integration.config.ts` and reads `TEST_DATABASE_URL`. The unit suite (`npm run test`) must not need Docker.
   - `global_setup.ts` refuses a database whose name does not contain "test", then runs `prisma migrate deploy` on it with `?schema=platform`.
   - `reset_database.ts` truncates every platform table before each test, and `fileParallelism` is off because all files share those tables.
   - The tests live in `apps/web/src/__tests__/integration/*.int.test.ts` and are excluded from `npm run test`.
4. Contract tests (`apps/web/src/__tests__/contract/`) run in the normal unit suite. They check the gateway against fixtures copied from `sineva-ai` ([ADR-0015](0015-sineva-ai-owns-internal-chat-contract.md)).
5. `apps/web/src/__tests__/architecture.test.ts` enforces dependency rules as part of the normal suite.
6. A task is done when `npm run lint && npm run typecheck && npm run test && npm run build` pass, plus `npm run test:integration` when database code changed.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and build on Node 24 for pushes and pull requests to `main` and `develop`. Current gap: CI has no Postgres, so `test:integration` does not run there. Target: an integration job with a Postgres service.

## Consequences

- Fakes must stay faithful to the real adapters. The integration tests are what keeps them honest, so a port change updates the fake and the integration test in the same change.
- Because CI does not run `test:integration`, a change to database code needs a local run, with the output in the pull request.
- The integration database is disposable, so `migrate dev` and reset commands are allowed there and nowhere else ([ADR-0006](0006-shared-postgres-platform-schema.md)).
- Writing the test first costs time up front and catches interface mistakes before code exists.

## Alternatives considered

- Mocking modules with `vi.mock`. Rejected: it ties tests to import paths and call order instead of behavior, and the repository ports already allow plain fakes.
- Running every test against a real database. Rejected: slow, needs Docker for the whole suite, and flaky for pure logic.
- A different database engine as a stand-in for Postgres. Rejected: the schema relies on Postgres features (the `platform` schema, `uuid`, `gen_random_uuid()`), so results would not transfer.

## Origin

Absorbs the testing and CI content of `docs/engineering/testing_and_ci.md` (TDD, Vitest, the four verification commands). The old text said CI ran on Node 22. The workflow file uses Node 24.
