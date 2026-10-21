---
title: "Engineering"
category: "engineering"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "engineering", "index", "standards", "database", "testing"]
summary: "Index of the how-we-write-code docs: coding standards, backend patterns, response and error handling, Redux state, database conventions and migrations, and testing."
related_docs:
  - "../README.md"
  - "../governance/agent_rules.md"
  - "../project-structure/README.md"
  - "../deployment/README.md"
---

# Engineering

How code in `apps/web` and `packages/shared` is written, structured and tested. It covers conventions and patterns as they exist in the code, plus the database and testing procedures. It does not cover where code lives (see [project-structure](../project-structure/README.md)), how it is deployed ([deployment](../deployment/README.md)), or the wire contract ([api-spec](../api-spec/README.md)).

## Files

| File | What it covers | Read it when |
| :--- | :--- | :--- |
| [coding_standards.md](coding_standards.md) | What TypeScript, ESLint and Prettier enforce, naming, comment and commit rules | You start writing code in the repo |
| [design_pattern.md](design_pattern.md) | Ports and adapters, use cases, container getters, Zod at the edges, contract-guard types | You add a use case, adapter or route |
| [response_pattern.md](response_pattern.md) | The `ApiResponse` envelope, `response_helper`, status codes the code produces | You add or change an endpoint response |
| [error_handling_and_failure_modes.md](error_handling_and_failure_modes.md) | `DomainError` to HTTP status, logging, the no-silent-fallback rule, fallbacks that remain | You touch an adapter or an error path |
| [state_management_redux.md](state_management_redux.md) | The two slices, per-mount store, what belongs in Redux | You change client state |
| [database_conventions.md](database_conventions.md) | Schema ownership, tables, UUID keys, naming, timestamps, row-to-entity mapping | You read or write the Prisma schema or a repository |
| [database_migrations_workflow.md](database_migrations_workflow.md) | Adding a table step by step, deploy, seeding, forbidden commands, recovery | You change the schema or deploy a migration |
| [testing_strategy.md](testing_strategy.md) | Test layers, commands, throwaway Postgres, TDD evidence, what CI runs | You write a test or a CI step |

## Suggested reading order

1. `coding_standards.md`, then `design_pattern.md` for the shape of the backend.
2. `response_pattern.md` and `error_handling_and_failure_modes.md` before any route work.
3. `testing_strategy.md` before your first change, because the test comes first.
4. `database_conventions.md`, then `database_migrations_workflow.md`, before any schema work.
5. `state_management_redux.md` for client work.

## Related

- Folders: [governance](../governance/README.md), [project-structure](../project-structure/README.md), [deployment](../deployment/README.md), [troubleshooting](../troubleshooting/README.md), [api-spec](../api-spec/README.md).
- Rules: R-01, R-02 (TDD and verification), R-07 to R-14 (layers and containers), R-15 to R-22 and R-39 (database), R-23 to R-26 (contract and failures), R-41 (upstream failures). See [agent rules](../governance/agent_rules.md).
- Decisions: [ADR-0004](../decisions/0004-web-app-structure-and-dependency-rules.md), [ADR-0005](../decisions/0005-prisma-replaces-drizzle.md), [ADR-0006](../decisions/0006-shared-postgres-platform-schema.md), [ADR-0007](../decisions/0007-tdd-fakes-integration-containers.md), [ADR-0008](../decisions/0008-no-silent-fallbacks.md), [ADR-0014](../decisions/0014-uuid-primary-keys.md), [ADR-0016](../decisions/0016-upstream-failures-return-502-503.md).
