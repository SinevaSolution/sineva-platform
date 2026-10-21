---
title: "ADR-0005: Prisma replaces Drizzle"
category: "decisions"
status: "active"
version: "1.1.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "prisma", "drizzle", "database", "dependencies"]
summary: "Prisma 7.10.1, pinned exactly, is the only ORM and migration tool; it is implemented and Drizzle is removed."
related_docs:
  - "0006-shared-postgres-platform-schema.md"
  - "0007-tdd-fakes-integration-containers.md"
  - "0014-uuid-primary-keys.md"
  - "../engineering/database_conventions.md"
  - "../engineering/database_migrations_workflow.md"
adr_id: "0005"
decision_status: "Accepted"
supersedes: ["Initial scaffold decision to use Drizzle ORM"]
---

# ADR-0005: Prisma replaces Drizzle

## Status

Accepted (2026-10-21). Implemented.

## Context

The initial scaffold used Drizzle ORM. The platform's tables need a migration workflow with committed SQL history, a typed client generated from one schema file, and a seed script. The Postgres database is shared with `sineva-ai` ([ADR-0006](0006-shared-postgres-platform-schema.md)), so the migration tool must be one the team can run safely.

## Decision

Prisma replaces Drizzle entirely. No Drizzle package or code remains.

- Pin `prisma`, `@prisma/client` and `@prisma/adapter-pg` to exactly `7.10.1` (no `^`, no `~`) in `apps/web/package.json`.
- Layout:
  - `apps/web/prisma.config.ts`
  - `apps/web/prisma/schema.prisma`
  - `apps/web/prisma/migrations/` (committed SQL)
  - `apps/web/prisma/seed.ts`
- The generated client uses the `prisma-client` generator and goes to `src/server/infrastructure/database/generated`. It is gitignored (see root `.gitignore`) and rebuilt by `npm run db:generate`. Never edit or commit it.
- `apps/web/package.json` has `db:generate`, `db:migrate:dev`, `db:migrate:deploy` and `db:seed`. `dev`, `build` and `typecheck` run `db:generate` first.
- `prisma.config.ts` reads `process.env.DATABASE_URL ?? ''` instead of `env('DATABASE_URL')`. `env()` throws when the variable is unset, and `generate`, `build` and `typecheck` must work without a database (CI, Docker builds). Commands that connect fail on the empty URL with their own error.
- Runtime access goes through `@prisma/adapter-pg` (`PrismaPg`) in `database/prisma_client.ts`, created lazily with a 5 second connect timeout. The adapter is `PrismaAgentRepository`, wired in `server/container.ts`.
- Prisma code lives only in `src/server/infrastructure/database/`. The domain and application layers know repository ports, not Prisma ([ADR-0004](0004-web-app-structure-and-dependency-rules.md)).

### Why the exact pin

On 2026-10-21, `npm view prisma dist-tags` returned `latest: 8.0.0-rc.23`, a release candidate, and `prev: 7.10.1`. The `latest` tag pointed at a pre-release, so an unpinned `npm install prisma` installs an RC. Never install these packages without an explicit version. To add or change one:

```bash
npm install --save-exact prisma@7.10.1 @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1
```

All three must move together. Upgrading is its own change with its own review, and only to a stable release.

## Consequences

- One tool owns schema, migrations, client generation and seeding.
- `typecheck` and `build` depend on a generated client, which is why they run `db:generate` first. Any new script that imports the client needs the same step.
- Implementation status (Current): `schema.prisma`, `prisma.config.ts`, the `20261021013412_init` migration, `seed.ts` and `PrismaAgentRepository` exist. The Drizzle files and `InMemoryAgentRepository` are gone.
- `architecture.test.ts` still lists `drizzle-orm` and `drizzle-kit` among forbidden domain imports. That is harmless and keeps Drizzle out of the domain if someone reintroduces it.

### Gotcha: where `_prisma_migrations` lands

Prisma keeps its own bookkeeping table, `_prisma_migrations`, in the schema named by the `schema` parameter of `DATABASE_URL`, or in `public` when there is none. The platform must not use `public`, so:

- `prisma migrate deploy` on the shared database uses `DATABASE_URL` with `?schema=platform`. The table lands in `platform`. The migration SQL is already schema-qualified, so the tables land in `platform` either way.
- `prisma migrate dev` uses a plain URL on a throwaway database. With `?schema=platform`, `migrate dev` emits unqualified SQL, so that form is for `deploy` only.
- The integration setup (`apps/web/src/__tests__/integration/global_setup.ts`) runs `migrate deploy` with `?schema=platform` on the test database, which mirrors production.
- Migrations are an explicit release step. The Dockerfile `CMD` runs `next start` only.

## Alternatives considered

- Keep Drizzle. Rejected by the Founder.
- Install the current `latest` Prisma (8.0.0-rc.23). Rejected: release candidate.
- Pin with a caret range (`^7.10.1`). Rejected: a caret range on a fresh install can drift across minor versions, and the three packages must stay in lockstep.
