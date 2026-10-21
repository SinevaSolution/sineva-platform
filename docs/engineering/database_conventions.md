---
title: "Database Conventions"
category: "engineering"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "postgresql", "prisma", "database", "schema", "uuid", "snake-case"]
summary: "How the platform's Prisma schema is laid out in the shared Postgres database: schema ownership, tables, UUID keys, naming, timestamps, foreign keys, JSON columns and how rows become domain entities."
related_docs:
  - "database_migrations_workflow.md"
  - "testing_strategy.md"
  - "error_handling_and_failure_modes.md"
  - "../deployment/environment_variables.md"
  - "../decisions/0005-prisma-replaces-drizzle.md"
  - "../decisions/0006-shared-postgres-platform-schema.md"
  - "../decisions/0014-uuid-primary-keys.md"
  - "../governance/agent_rules.md"
---

# Database Conventions

Source of truth: `apps/web/prisma/schema.prisma` and the SQL under `apps/web/prisma/migrations/`. This page explains the rules behind them. For changing the schema, see [database migrations workflow](database_migrations_workflow.md). Rules: R-15 to R-22 and R-39 in [agent rules](../governance/agent_rules.md). "Current" is what the code does today; "Target" is decided but not built.

## Schema ownership

One Postgres 17 database, `sineva_platform`, is shared by two services. Each owns one schema and migrates it with its own tool.

| Schema | Owner | Migration tool | History table |
| :--- | :--- | :--- | :--- |
| `platform` | `sineva-platform` | Prisma (`apps/web/prisma/migrations`) | `platform._prisma_migrations` |
| `sineva_ai` | `sineva-ai` | Alembic (`sineva-ai/migrations`) | `sineva_ai.alembic_version` |
| `public` | nobody | none | none |

Nothing from either service belongs in `public`. The one way platform objects end up there is a mistake: running `migrate deploy` with a plain `DATABASE_URL` puts `_prisma_migrations` in `public` (recovery is in the migrations workflow). Do not create cross-schema foreign keys; they would couple two release steps that are meant to be independent.

How it is enforced: the datasource declares `schemas = ["platform"]`, every model carries `@@schema("platform")`, and every statement in the committed migration SQL is prefixed `"platform".`. At runtime Prisma queries are schema-qualified through `@@schema`, so the app's `DATABASE_URL` needs no `?schema=` parameter (the integration tests run the client on a plain URL).

## Tables

| Table | Model | Purpose | Written by today |
| :--- | :--- | :--- | :--- |
| `workspaces` | `Workspace` | A customer workspace: slug, name, subscription tier, monthly token quota and usage | nothing |
| `users` | `User` | A person in a workspace: email, name, role, active flag | nothing |
| `agent_configs` | `AgentConfig` | Catalogue and runtime state of each companion: slug, display name, category, status, capabilities, latency and usage counters | `prisma/seed.ts`, `PrismaAgentRepository.create` |
| `chat_sessions` | `ChatSession` | A conversation of one user with one companion | nothing |
| `chat_messages` | `ChatMessage` | One message in a session | nothing |
| `storage_objects` | `StorageObject` | Metadata of a file uploaded through a presigned URL | nothing |

Current: application code reads and writes only `agent_configs`. The other five tables exist in the init migration with no adapter behind them. The platform does not persist chat history in these tables; sessions and messages live on the `sineva-ai` side (`sineva_ai.agent_sessions`, `sineva_ai.agent_messages`), whose Postgres persistence is currently dormant.

`agent_configs.workspace_id` is nullable on purpose. A null workspace means a global catalogue entry. The seeded companions all have a null `workspace_id`.

## Primary keys

Every table has `id`, type `UUID`, default `gen_random_uuid()`. In Prisma:

```prisma
id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
```

- The database generates ids. Application code never mints one, and no id carries a prefix (`usr_...`, `agt_...`).
- `gen_random_uuid()` returns a v4 UUID. Postgres 17 has no native uuidv7, so ids do not sort by time. Order by `created_at`, with `id` as the tie-breaker (as `PrismaAgentRepository.findAll` does).
- Foreign key columns are `@db.Uuid` as well and are named `<entity>_id` (`workspace_id`, `user_id`, `session_id`).
- `sineva-ai` also uses UUID keys but names them after the entity (`session_id`, `agent_id`). The column name `id` is a platform rule only ([ADR-0014](../decisions/0014-uuid-primary-keys.md), R-39).

Gotcha: the chat route accepts `user_id` as any 3 to 128 character string, and the dashboard sends `usr_executive_01`. That value cannot be stored in `chat_sessions.user_id`, which is a UUID foreign key to `users`. This does not bite today because nothing writes `chat_sessions`. It will the day persistence lands, so the identity model has to be settled first (R-27).

## Naming

| Thing | Convention | Example |
| :--- | :--- | :--- |
| Table | plural `snake_case`, set with `@@map` | `agent_configs` |
| Prisma model | singular PascalCase | `AgentConfig` |
| Column and Prisma field | `snake_case`, same name in both, no `@map` | `agent_slug` |
| Constraint and index names | Prisma defaults | `agent_configs_pkey`, `users_email_key`, `users_workspace_id_fkey` |

Fields stay `snake_case` in the Prisma client too, so a row property, the domain entity property and the wire key are the same string (`row.agent_slug`, `entity.agent_slug`, `agent_slug` in JSON). That removes the mapping layer ([ADR-0003](../decisions/0003-snake-case-wire-contract.md)). Do not hand-rename constraints; let Prisma generate the names so later migrations diff cleanly.

## Types and timestamps

- Strings are `text` (Prisma `String`). There is no `varchar` length limit at the database; limits live in the Zod DTOs.
- Timestamps are `TIMESTAMPTZ(6)`: `@db.Timestamptz(6)` with `@default(now())`. Prisma returns them as `Date`, and the adapter converts to ISO strings (see below).
- Counters are `Int` (32-bit). `storage_objects.file_size_bytes` is `Int`, which caps at about 2.1 GB. The presign DTO already caps uploads at 100 MiB.
- Enum-like values (`agent_configs.category`, `status`, `users.role`, `chat_messages.sender_role`) are plain `text`. There is no Postgres enum and no `CHECK` constraint, so the database accepts any string. Validation happens in the adapter (see below). That keeps a new value from needing a migration, at the price of trusting every writer.
- `chat_messages` has `created_at` only. Messages are append-only.

Known debt: `updated_at` does not update itself. The column defaults to `now()` on insert, there is no `@updatedAt` attribute and no trigger, and `PrismaAgentRepository` has no update path yet. Whoever adds the first update must also decide how `updated_at` is maintained: Prisma's `@updatedAt` (set by the client, so a direct SQL write by another service will not touch it) or a database trigger (covers every writer, but is a migration to maintain). Until then, do not read `updated_at` as "last modified".

## Foreign keys and delete behavior

Every relation is `onDelete: Cascade`, and Prisma's default `ON UPDATE CASCADE` applies.

```text
workspaces
  +-- users              -- chat_sessions -- chat_messages
  +-- agent_configs (workspace_id nullable)
  +-- chat_sessions
  +-- storage_objects
```

Deleting a workspace deletes its users, workspace-scoped companions, sessions, messages and storage rows. No delete path exists in the code today, so this is a property of the schema, not behavior you can hit yet. Set `onDelete` deliberately on each new relation; do not leave it to the default.

Gotcha: `chat_sessions.agent_slug` and `chat_messages.agent_slug` are plain text, not foreign keys to `agent_configs`. The slug is the routing key shared with `sineva-ai`. Renaming a slug therefore means updating those tables too (see the slug data fix in the migrations workflow).

Postgres does not index foreign key columns automatically, and Prisma does not add `@@index`. Current: the only indexes are the primary keys and four unique indexes (`workspaces.workspace_slug`, `users.email`, `agent_configs.agent_slug`, `storage_objects.object_key`). Add `@@index` when a query needs it.

## JSON columns

`agent_configs.capabilities` and `chat_messages.suggested_actions` are `Json` (Postgres `jsonb`) with default `'[]'`.

- Prisma types the value as `JsonValue`. Never cast it. Narrow it at the adapter boundary, as `toCapabilities` does for `capabilities`.
- Write plain typed values (`string[]`). Do not stringify.
- Do not query inside JSON from application code without an index plan.

## From row to domain entity

`apps/web/src/server/infrastructure/database/prisma_agent_repository.ts` is the reference adapter. The domain never sees a Prisma type (the architecture test blocks `@prisma/` imports in `domain`).

- Explicit mapping. `toEntity(row)` copies each field by name. Nothing is spread, so a new column does not leak into the entity or the wire by accident. `Date` columns become ISO strings.
- Runtime narrowing instead of casts. The columns are free-form text and JSON, and another writer could store a value the domain does not know. `toCategory` and `toStatus` check against `Record<Union, true>` maps with `Object.hasOwn`, and `toCapabilities` checks for `string[]`. An unknown value throws an `Error` naming the agent slug and the bad value. A `Record<Union, true>` rather than an array means adding a member to the domain union fails to compile until the adapter is updated.
- One bad row fails the whole page. `findAll` maps every row on the page, so a single corrupt row rejects the request. The integration tests assert this. That is deliberate: it surfaces corruption at the boundary instead of passing an impossible value to the UI.
- Conflict comes from the unique index. `create` does not check for the slug first (that would race). It inserts, and `isUniqueViolation` maps Prisma error `P2002` to `ConflictError`, which the route returns as 409 `RESOURCE_CONFLICT`.
- Page and total in one transaction. `findAll` runs `findMany` and `count` through `$transaction`, ordered by `created_at` then `id`, so pages neither overlap nor skip.

Known debt: the initial runtime state of a new companion (`status: 'online'`, `avg_latency_ms: 350`, `active_sessions_count: 1`, `accent_token: '--teal-500'`) is written inside `PrismaAgentRepository.create`. It is business logic and belongs in a domain factory.

## The runtime client

`getPrismaClient()` in `database/prisma_client.ts` is lazy: nothing connects until the first call, which keeps `next build` away from the database. It builds a `PrismaClient` over `@prisma/adapter-pg` with `connectionTimeoutMillis: 5000`, so an unreachable database fails in 5 seconds instead of hanging. Outside production it is cached on `globalThis` so hot reloads do not leak connection pools. Construct it through `server/container.ts` only (R-10).

`DATABASE_URL` is read through `getEnvConfig()`, which has a hardcoded localhost default. See [environment variables](../deployment/environment_variables.md) for why that is debt.

## Other debt on the data model

- Duplicate companion registry: platform `agent_configs`, and `sineva-ai`'s own catalogue (static plus its `ai_agents` table). The two can drift; the slug is the only link.
- `chat_messages.reasoning_summary`, `suggested_actions` and `tokens_used` are unused columns left from the old chat response shape.
- Cache invalidation after `create` clears only the page-1 key, so the cache can serve a stale list for up to 30 seconds.
