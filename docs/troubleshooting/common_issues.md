---
title: "Common Build and Development Issues"
category: "troubleshooting"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "troubleshooting", "prisma", "nextjs", "vitest", "architecture-test"]
summary: "Symptoms, causes and fixes for the build, Prisma client, server-only, architecture test, integration test and request validation problems you meet while developing sineva-platform."
related_docs:
  - "README.md"
  - "docker_and_internal_network.md"
  - "storage_db_and_redis.md"
  - "../engineering/testing_strategy.md"
  - "../engineering/database_migrations_workflow.md"
  - "../governance/agent_rules.md"
---

# Common Build and Development Issues

Each entry gives the symptom, the cause and the fix. Errors quoted from the tools were reproduced unless marked "expected". For database problems see [storage, DB and Redis](storage_db_and_redis.md); for chat 502 and 503 see [Docker and internal network](docker_and_internal_network.md).

## Prisma client missing or out of date

Symptom: TypeScript or Next fails to resolve `./generated/client` (expected message: "Cannot find module"), or `tsc` reports that a model field you just added does not exist.

Cause: the client under `apps/web/src/server/infrastructure/database/generated` is gitignored build output. A fresh clone has none, and it goes stale whenever `schema.prisma` changes.

Fix: `npm run db:generate` from `apps/web` (or `npm --workspace=@sineva/web run db:generate`). `dev`, `build`, `typecheck` and `test:integration` run it for you. `npm run test` does not, and does not need it: unit tests use fakes and the route tests mock the container. Never edit or commit the generated folder (R-22).

## "Connection url is empty" from a Prisma command

Symptom: `prisma migrate status`, `migrate deploy` or `db seed` stops with `Connection url is empty`.

Cause: `prisma.config.ts` uses `process.env.DATABASE_URL ?? ''` on purpose, so `generate` and `build` work without a database. Commands that connect fail on the empty value.

Fix: export `DATABASE_URL` for that command, or put it in `apps/web/.env` or the repo-root `.env`. Print the host and database name before you run anything that writes (R-18). Precedence of the files is in [environment variables](../deployment/environment_variables.md).

## `server-only` error

Symptom, build or browser: "This module cannot be imported from a Client Component module. It should only be used from a Server Component."

Cause: client code imported a module that starts with `import 'server-only'`, directly or through a chain. Also fires in Vitest when the alias is missing.

Fix, in the app: move the type the client needs to `src/shared`, or fetch through a route or a server component. Client code never imports `@/server/**` (R-08). ESLint reports `Client code must not import from src/server`, and the architecture test lists the offending file.

Fix, in tests: both `vitest.config.ts` and `vitest.integration.config.ts` alias `server-only` to `src/__tests__/stubs/server_only.ts`. A new Vitest config needs the same alias.

## Architecture test fails

`architecture.test.ts` prints violations as `file -> specifier`, relative to `src`. Match the message:

| Failure | Meaning | Fix |
| :--- | :--- | :--- |
| `client/... -> @/server/...` | Client imports server code | Move the shared type to `src/shared` |
| `server/domain/... -> next`, `react`, `@prisma/...`, `pg`, `@aws-sdk/...` | Domain depends on a framework or driver | Put the dependency behind a port in infrastructure |
| `server/application/... -> @/server/infrastructure` or `http` | A use case reaches outward | Depend on the port in `domain/repositories` |
| `server/infrastructure/... -> @/server/application` or `http` | An adapter reaches into upper layers | Adapters implement ports; they do not call use cases |
| list of files under "marks every infrastructure file" | Missing `import 'server-only';` | Add it as an import line. Generated Prisma files are exempt |
| `app/... -> @/server/infrastructure/...` | A route bypasses the container | Get the use case from `@/server/container` (only `openapi` is allowed) |
| `src/domain should no longer exist` (or `application`, `infrastructure`, `presentation`) | A legacy folder came back, often from a checkout or merge | Delete it and move the code to `src/server` or `src/client` |

Relative paths do not dodge the check: specifiers are normalized to `@/...` before matching. Comments are stripped first, so prose in a comment does not trip it.

## Integration tests refuse to start

- `TEST_DATABASE_URL is required for integration tests`: the variable is unset. Start the throwaway container and export it ([testing strategy](../engineering/testing_strategy.md)).
- `Refusing to run: database "..." does not look like a test database (name must contain "test")`: the safety check stopped you, which is the point. Use a database whose name contains `test`. The check reads only the database name, so also check the host.
- `P1001: Can't reach database server` during setup: the container is not running or the port differs. See [storage, DB and Redis](storage_db_and_redis.md).

## 422 on a request that "looks right"

Symptom: `POST /api/v1/agents`, the chat route or presign returns 422 `VALIDATION_ERROR` with `Request payload validation failed`.

Cause: the Zod schema in `src/server/application/dtos` rejected the body. Keys must be `snake_case`. The schemas are not strict, so a camelCase key (`agentSlug`, `fileName`) is dropped silently and the real error is the required `snake_case` field that is then missing.

Fix: read `errors[].field` and `errors[].detail` in the response. They name the field and the rule. Constraints you may trip: `agent_slug` is lowercase letters, digits and hyphens, 3 to 64 characters; chat `message_text` is 1 to 8000 characters; chat `session_id`, when present, must be a UUID; `file_size_bytes` is at most 104,857,600.

## Stale `.next` or turbo cache

Symptom: a change does not show up, or Next reports files that no longer exist (common after the move from `src/presentation` to `src/client`).

Fix:

```bash
rm -rf apps/web/.next .turbo
npm run build
```

`@sineva/shared` and `@sineva/ui` export their `src` directly and have no `dist` folder, so there is nothing to rebuild there. (An earlier version of this page described a `dist` step that no longer applies.)

## `npm install` pulled a Prisma release candidate

Symptom: `package.json` shows `prisma` or `@prisma/client` as `8.0.0-rc.23` or with a `^` prefix.

Cause: the packages were installed without an exact version. On 2026-10-21 the npm `latest` tag for `prisma` was a release candidate, and the CLI's "update available" banner suggests it.

Fix: `npm install --save-exact prisma@7.10.1 @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1` from `apps/web` (R-16), then `npm run db:generate`.
