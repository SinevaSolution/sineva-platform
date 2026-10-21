---
title: "ADR-0006: Shared Postgres with a dedicated platform schema"
category: "decisions"
status: "active"
version: "1.1.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "postgres", "prisma", "migrations", "safety"]
summary: "Platform tables live only in the schema platform and sineva-ai tables only in sineva_ai, both in the shared sineva_platform database, and destructive Prisma commands never run against shared or persistent data."
related_docs:
  - "0005-prisma-replaces-drizzle.md"
  - "0007-tdd-fakes-integration-containers.md"
  - "0014-uuid-primary-keys.md"
  - "../engineering/database_conventions.md"
  - "../engineering/database_migrations_workflow.md"
  - "../troubleshooting/storage_db_and_redis.md"
adr_id: "0006"
decision_status: "Accepted"
supersedes: []
---

# ADR-0006: Shared Postgres with a dedicated platform schema

## Status

Accepted (2026-10-21). Both schemas are implemented.

Cross-service: mirrored in sineva-ai `docs/decisions/` (a sineva-ai ADR of the same title; that folder does not exist yet, so no number is cited). Change both repos together.

## Context

`sineva-platform` and `sineva-ai` use the same Postgres instance and the same database, `sineva_platform` (see `POSTGRES_DB` and both `DATABASE_URL` values in `docker-compose.yml`). `sineva-ai` is Python and manages its tables with SQLAlchemy and Alembic, in its own schema `sineva_ai`. The platform uses Prisma ([ADR-0005](0005-prisma-replaces-drizzle.md)). Two migration tools on one database will conflict if both manage the same namespace, and some Prisma commands drop objects. Each tool also keeps a bookkeeping table (`_prisma_migrations`, `alembic_version`), which has to land in its owner's schema.

## Decision

- Platform tables live only in the Postgres schema `platform`. In `apps/web/prisma/schema.prisma` the datasource declares `schemas = ["platform"]` and every model carries `@@schema("platform")`.
- `sineva-ai` tables live only in the schema `sineva_ai`, managed by Alembic (`sineva-ai/migrations/`). Its `env.py` sets `version_table_schema` to `sineva_ai` and filters reflection to that schema, so `alembic_version` is not in `public` and Alembic ignores the platform's tables.
- Neither service writes to `public`.
- Tables: `workspaces`, `users`, `agent_configs`, `chat_sessions`, `chat_messages`, `storage_objects`.
- Tables and columns are `snake_case`. Primary keys are UUIDs, named `id` on the platform ([ADR-0014](0014-uuid-primary-keys.md)).
- Never run `prisma migrate reset` or `prisma db push`, and never accept a reset prompt, against a shared or persistent database. Both can drop objects.
- `prisma migrate dev` runs only against a throwaway database (a disposable local container).
- Committed migration SQL in `apps/web/prisma/migrations/` is the record of schema changes. Shared and production environments get `prisma migrate deploy` only.
- `migrate deploy` on the shared database uses `DATABASE_URL` with `?schema=platform`, so `_prisma_migrations` lands in `platform`. With a plain URL it lands in `public`. `migrate dev` does the opposite: on a throwaway database with a plain URL, because with `?schema=platform` it emits unqualified SQL ([ADR-0005](0005-prisma-replaces-drizzle.md)).
- Migrations are an explicit release step, not part of the Docker `CMD`. The database name is `sineva_platform`.

## Consequences

- A reset or push aimed at the platform cannot be assumed to stay inside `platform`. The safety comes from where you point the command, so check the target database before running anything.
- `npm run docker:down` runs `docker compose down -v` and deletes the Postgres volume, which holds `sineva-ai` data too. See the gotchas in the root `AGENTS.md`.
- Integration tests need their own throwaway database ([ADR-0007](0007-tdd-fakes-integration-containers.md)).
- Changes to the `sineva_ai` schema belong to `sineva-ai` and are out of this repository's scope. The `public` schema is unused by both services.

## Alternatives considered

- Separate database for the platform. Not chosen in this decision: the Founder set one shared database with schema separation.
- Platform tables in `public` next to `sineva-ai` tables. Rejected: both migration tools would manage one namespace.
