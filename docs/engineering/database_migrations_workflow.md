---
title: "Database Migrations Workflow"
category: "engineering"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "prisma", "migrations", "postgresql", "release", "seed", "runbook"]
summary: "Step-by-step procedure for adding or changing a table with Prisma on the shared Postgres database, plus deploy, seeding, forbidden commands and recovery."
related_docs:
  - "database_conventions.md"
  - "testing_strategy.md"
  - "../deployment/environment_variables.md"
  - "../deployment/ci_cd_pipeline.md"
  - "../troubleshooting/storage_db_and_redis.md"
  - "../decisions/0005-prisma-replaces-drizzle.md"
  - "../decisions/0006-shared-postgres-platform-schema.md"
  - "../governance/agent_rules.md"
---

# Database Migrations Workflow

The platform and `sineva-ai` share one Postgres database, and a wrong Prisma command can drop objects that are not yours. Read [database conventions](database_conventions.md) first. Rules: R-16 to R-20, R-22 and R-42 in [agent rules](../governance/agent_rules.md). Folder-level guard rails for agents: `apps/web/prisma/AGENTS.md`.

Commands below run from `apps/web`, or from the repo root as `npm --workspace=@sineva/web run <script>`. The scratch-database, `migrate dev`, `migrate deploy` and seed commands in this page were run against a local Postgres 17 container while writing it. The compose-based release command is derived from the compose file and was not run.

## The one rule behind everything

Prisma writes its bookkeeping table `_prisma_migrations` to the schema named in the URL, and to `public` when the URL names none. The two URL forms behave differently:

| `DATABASE_URL` | Where `_prisma_migrations` goes | SQL that `migrate dev` writes |
| :--- | :--- | :--- |
| plain (`.../sineva_dev_scratch`) | `public` | schema-qualified: `CREATE TABLE "platform"."probes"` |
| `...?schema=platform` | `platform` | unqualified: `CREATE TABLE "probes"` |

So `migrate dev` always uses the plain URL, on a throwaway database. `migrate deploy` on the shared database always uses `?schema=platform`. Mixing them either creates tables without a schema prefix or splits the history across two schemas.

## Throwaway databases

You need two disposable databases: one for `migrate dev`, one for integration tests. Keep them separate. The test database's history lives in `platform` (the test setup deploys with `?schema=platform`), while `migrate dev` with a plain URL looks in `public`, so it would see the test database as unmigrated.

```bash
docker run --rm -d --name sineva-pg-scratch \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=sineva_dev_scratch \
  -p 55432:5432 postgres:17-alpine
docker exec sineva-pg-scratch pg_isready -U test -d sineva_dev_scratch
docker exec sineva-pg-scratch psql -U test -d postgres -c "create database sineva_platform_test"

export DEV_URL=postgresql://test:test@localhost:55432/sineva_dev_scratch
export TEST_DATABASE_URL=postgresql://test:test@localhost:55432/sineva_platform_test
```

`--rm` deletes the container and its data when you `docker stop sineva-pg-scratch`. Port 55432 avoids the compose Postgres on 5432. Before using any URL, check that the host is `localhost` and the database is one of these two.

## Add or change a table

1. Edit `prisma/schema.prisma`. Follow [the conventions](database_conventions.md): `@@schema("platform")`, `@@map`, UUID `id`, snake_case fields, an explicit `onDelete`. Run `npm run db:generate` so the client has the new types.
2. Write the failing integration test (R-01). Put it in `src/__tests__/integration/*.int.test.ts`. The schema now describes the table or column, but no migration creates it, so the test database has no such relation. Run `npm run test:integration` and expect a database error about the missing relation or column. Keep that output as red evidence for the PR.
3. Create the migration against the scratch database:
   ```bash
   DATABASE_URL=$DEV_URL npm run db:migrate:dev -- --name add_widgets
   ```
   Use `--create-only` as well when the SQL needs hand edits before it is applied (see the review list). If Prisma asks to reset the database, check the URL once more. On the scratch database a reset is fine. Anywhere else, stop (R-18, R-19).
4. Review the SQL in `prisma/migrations/<timestamp>_add_widgets/migration.sql`:
   - Every statement names the schema: `"platform"."widgets"`. An unqualified table means the wrong URL form was used.
   - Nothing is created in, or altered in, `public`.
   - `id` is `UUID NOT NULL DEFAULT gen_random_uuid()`.
   - No unintended `DROP`. Prisma cannot tell a column rename from a drop plus an add, so it plans the pair, which loses the data (recalling Prisma's behavior, not run here). Rewrite it as `ALTER TABLE ... RENAME COLUMN` in a `--create-only` migration.
   - A new `NOT NULL` column without a default fails on a table that already has rows. Add a default, or backfill in the migration.
5. Run the test again and watch it pass: `npm run test:integration`. The test setup applies every committed migration to `sineva_platform_test` with `migrate deploy` and `?schema=platform`, which is the same path production takes.
6. Run the full verification (R-02): `npm run lint && npm run typecheck && npm run test && npm run build`, plus `npm run test:integration`.
7. Commit `schema.prisma` and the new migration folder together (R-20), with a Conventional Commit message. Do not edit a migration after it is committed or applied anywhere; Prisma stores a checksum of each applied migration and reports a modified one as drift (recalling, not run here). Add a new migration instead.

Prisma has no down migrations. To undo a change, write a new forward migration.

## Deploy

Migrations are an explicit release step, separate from starting the app. The Dockerfile `CMD` only runs `next start`; it does not migrate. Order for a release:

1. Build the image. It already contains the generated client, because `npm run build` runs `prisma generate` in the builder stage.
2. Apply migrations with `?schema=platform` on the URL:
   ```bash
   DATABASE_URL='postgresql://USER:PASS@HOST:5432/sineva_platform?schema=platform' \
     npm --workspace=@sineva/web run db:migrate:deploy
   ```
   Against the compose stack (derived, not run), the same step from the built image:
   ```bash
   docker compose run --rm \
     -e DATABASE_URL='postgresql://USER:PASS@postgres:5432/sineva_platform?schema=platform' \
     sineva-platform npm --workspace=@sineva/web run db:migrate:deploy
   ```
   The runtime `DATABASE_URL` in `docker-compose.yml` has no `?schema=`, so it must be overridden for this one command.
3. Start or restart `sineva-platform`.

`migrate deploy` only applies pending migrations. It never resets and never creates new ones. Before a migration that drops or rewrites data, take a `pg_dump` of the `platform` schema. This repo documents no backup procedure yet.

On a fresh database both services need their release step before they take traffic: the platform's `migrate deploy` (the init migration runs `CREATE SCHEMA IF NOT EXISTS "platform"`), and `sineva-ai`'s `alembic upgrade head`.

## Coordinating with sineva-ai

`sineva-ai` migrates `sineva_ai` with Alembic (`sineva-ai/migrations`, history in `sineva_ai.alembic_version`). Its image ships the migrations and its Dockerfile documents the release step as `docker compose run --rm sineva-ai alembic upgrade head`; it is not part of its `CMD` either.

- The two histories are independent. A platform migration never touches `sineva_ai`, and the reverse.
- No cross-schema foreign keys, no reads of the other service's tables. Integration between the services goes through the HTTP contract ([ADR-0015](../decisions/0015-sineva-ai-owns-internal-chat-contract.md)), not through shared tables.
- Both services use UUID keys ([ADR-0014](../decisions/0014-uuid-primary-keys.md)). A slug or id both services rely on is changed in both repos in the same change.

## Seeding

`npm run db:seed` runs `prisma/seed.ts` against `DATABASE_URL` (either URL form works). It upserts the six companions by `agent_slug`, so you can run it any number of times: running it twice on an empty database leaves six rows. On conflict it refreshes only the catalogue columns (name, role, category, description, capabilities, model, accent token). It leaves `status`, latency, session and token counters alone, because those are live runtime values. Seeded rows have no workspace. The seed creates no workspaces or users.

Run it once after the first deploy to a new environment, and again after changing the catalogue text in `seed.ts`.

## Old `sino-*` slugs

Canonical slugs are `sinopeople`, `sinofinance`, `sinosales`, `sinosocial`, `sinohelp`, `sinoinsights` ([ADR-0012](../decisions/0012-canonical-product-slugs-and-guardrails.md)). A database seeded earlier with `sino-people`, `sino-finance` and so on keeps those rows: the seed upserts by slug, so it adds the new rows and never renames the old ones. The dashboard then lists duplicates, and chat to an old slug reaches `sineva-ai`, which no longer knows it (the platform shows a 502).

Fix it with a data change run before re-seeding. This is a manual step, not a committed migration. It ran correctly against a throwaway database holding one old row; `chat_sessions` and `chat_messages` were empty there. Rehearse it on a copy first.

```sql
BEGIN;
CREATE TEMP TABLE slug_map (old_slug text PRIMARY KEY, new_slug text NOT NULL) ON COMMIT DROP;
INSERT INTO slug_map VALUES
  ('sino-people', 'sinopeople'), ('sino-finance', 'sinofinance'),
  ('sino-sales', 'sinosales'), ('sino-social', 'sinosocial'),
  ('sino-help', 'sinohelp'), ('sino-insights', 'sinoinsights');
UPDATE platform.agent_configs t SET agent_slug = m.new_slug FROM slug_map m WHERE t.agent_slug = m.old_slug;
UPDATE platform.chat_sessions t SET agent_slug = m.new_slug FROM slug_map m WHERE t.agent_slug = m.old_slug;
UPDATE platform.chat_messages t SET agent_slug = m.new_slug FROM slug_map m WHERE t.agent_slug = m.old_slug;
COMMIT;
```

If the seed already ran, the canonical rows exist and the first `UPDATE` fails on the unique index on `agent_slug`. Then delete the old `agent_configs` rows instead and keep the two chat updates. Confirm what you delete before you delete it. The slugs also live in `sineva-ai` data, which this repo does not manage.

## Forbidden commands

| Command | Why | Do instead |
| :--- | :--- | :--- |
| `prisma migrate reset` | Drops and recreates; on a shared database it can take other services' objects with it | Throwaway database only, or fix forward with a new migration |
| `prisma db push` | Changes the schema without a migration file and can drop columns | `migrate dev` on a throwaway database |
| `migrate dev` on a shared or persistent database | May prompt to reset when it detects drift | `migrate deploy` |
| `migrate deploy` with a plain URL on the shared database | `_prisma_migrations` lands in `public`; the next deploy with `?schema=platform` then fails with P3005 | `?schema=platform` |
| `migrate dev` with `?schema=platform` | Writes SQL without schema prefixes | plain URL, throwaway database |
| Accepting any "reset" or "drift detected" prompt on a shared database | Same as `migrate reset` | Stop, run `prisma migrate status`, ask |
| Editing a committed or applied migration | Checksum no longer matches the history | A new migration |
| `npm install prisma` or `npm i prisma@latest` (the CLI banner suggests it) | `latest` was `8.0.0-rc.23`, a release candidate, on 2026-10-21 | `npm install --save-exact prisma@7.10.1`, same for `@prisma/client` and `@prisma/adapter-pg` |
| `npm run docker:down` | It is `docker compose down -v` and deletes the shared Postgres volume | `docker compose down` |

## Recovery

### `_prisma_migrations` landed in `public`

Symptom: `migrate deploy` with `?schema=platform` fails with `P3005` ("The database schema is not empty"). This reproduced on a throwaway database after a plain-URL deploy.

1. Confirm where the history is:
   ```sql
   SELECT table_schema FROM information_schema.tables WHERE table_name = '_prisma_migrations';
   ```
2. If it appears only under `public`, and the `platform` tables exist, move it:
   ```sql
   ALTER TABLE public._prisma_migrations SET SCHEMA platform;
   ```
3. Check with the `?schema=platform` URL: `prisma migrate status` should report "Database schema is up to date".

If the table exists in both schemas, stop and compare their rows before you drop anything. That case was not rehearsed.

### Drift or a reset prompt on a shared database

Do not accept it. Run `prisma migrate status` with the `?schema=platform` URL to see which migrations Prisma believes are applied, and ask. Recreating the platform schema from the committed migrations is a decision for a person, with a backup taken first.
