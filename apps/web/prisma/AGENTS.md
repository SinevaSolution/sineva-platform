# AGENTS.md: apps/web/prisma

Schema, migrations and seed for the platform's slice of a Postgres database that `sineva-ai` shares. This is the highest-risk folder in the repo: a wrong command can drop data that belongs to another service. Rules R-15 to R-22, R-39, R-42; decisions ADR-0005, ADR-0006, ADR-0014. Full procedure: `docs/engineering/database_migrations_workflow.md`.

## Before any Prisma command

Print the host and database name of `DATABASE_URL`. If it is not a local throwaway container, stop and ask.

## Never

- `prisma migrate reset` or `prisma db push` against a shared or persistent database. Never answer yes to a reset prompt; a drift warning on a shared DB means stop.
- `migrate dev` on anything but a throwaway database.
- Edit a migration folder that was already committed or applied. Add a new migration.
- Install `prisma`, `@prisma/client` or `@prisma/adapter-pg` without `--save-exact` and version `7.10.1`. The CLI's "update available" banner points at `8.0.0-rc.23`, a release candidate. Ignore it.
- Edit or commit `src/server/infrastructure/database/generated`. It is gitignored output of `npm run db:generate`.
- Create anything in `public`. `sineva-ai` owns schema `sineva_ai`; platform tables live in `platform`.
- Run `npm run docker:down` to "clean up". It is `down -v` and deletes the shared Postgres volume.

## Schema rules

- Every model has `@@schema("platform")` and `@@map("snake_case_plural")`. Models are PascalCase; fields are snake_case with no `@map`.
- Every table has `id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`. No cuid, no prefixed string ids.
- Timestamps are `@db.Timestamptz(6)` with `@default(now())`. `updated_at` does not update itself (known debt): set it in code when you add an update path.
- Set `onDelete` on every relation on purpose. Today all are `Cascade`.
- Enum-like values stay `String`; the repository adapter validates them, not the database.

## Commands (from `apps/web`, or `npm --workspace=@sineva/web run <script>`)

| Script | Use | `DATABASE_URL` |
| :--- | :--- | :--- |
| `db:generate` | rebuild the client; needs no DB | not needed |
| `db:migrate:dev` | create and apply a migration | throwaway DB, plain URL, no `?schema` |
| `db:migrate:deploy` | apply committed migrations (release step) | `...?schema=platform` |
| `db:seed` | upsert the six companions by `agent_slug` | the target DB |

Why the URL differs: with a plain URL, Prisma puts `_prisma_migrations` in `public`. With `?schema=platform` it goes to `platform`, but `migrate dev` then writes SQL without schema prefixes. So `migrate dev` uses the plain URL on a throwaway DB, and `migrate deploy` on a shared DB uses `?schema=platform`. Deploying with the wrong form fails with P3005 or splits the history across two schemas.

## Seed

`seed.ts` is idempotent: it upserts by `agent_slug`, and a re-run refreshes only catalogue columns (name, description, capabilities, model, accent). It never overwrites status, latency, session or token counters. Keep new seed data keyed by a natural unique column. It runs outside Next.js and must not import `prisma_client.ts` (`server-only`).

## Slugs

Canonical: `sinopeople`, `sinofinance`, `sinosales`, `sinosocial`, `sinohelp`, `sinoinsights`. A database seeded with old `sino-*` slugs keeps those rows after a re-seed. See the workflow doc for the data fix.
