---
title: "Environment Variables"
category: "deployment"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "environment", "configuration", "secrets", "docker-compose", "prisma"]
summary: "Every environment variable that sineva-platform, its Prisma tooling and docker-compose read, with required or default status, where it is read, and which defaults are known debt."
related_docs:
  - "docker_compose_topology.md"
  - "internal_network_security.md"
  - "ci_cd_pipeline.md"
  - "../engineering/database_migrations_workflow.md"
  - "../troubleshooting/common_issues.md"
  - "../governance/agent_rules.md"
---

# Environment Variables

Sources for this page: `apps/web/src/server/infrastructure/config/env.ts` (`getEnvConfig`), `apps/web/prisma.config.ts`, `apps/web/prisma/seed.ts`, `docker-compose.yml`, the `Dockerfile` and `turbo.json`. `.env.example` exists at the repo root but could not be read while writing this page, so it is not described here; check it against this table.

Rule: no new hardcoded secret defaults and no secret in a `NEXT_PUBLIC_*` variable (R-28). "Server-only" means the value is read by code that starts with `import 'server-only'`, so it can not reach the browser bundle.

## Platform app (`sineva-platform`)

`getEnvConfig()` reads these on every call (no caching, no validation). Current: every variable below has a fallback, so a missing one does not fail at startup.

| Variable | Required | Default in code | Compose value | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | no | `development` | `production` | Next sets it. Also decides whether the Prisma client is cached on `globalThis` (non-production) or in a module variable (production) |
| `DATABASE_URL` | yes | `postgresql://sineva_user:sineva_secret_password@localhost:5432/sineva_platform` (debt) | `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}` | Runtime URL: plain, no `?schema=`. The health check reports Postgres "healthy" whenever this is set, without connecting. For `migrate deploy` it must end in `?schema=platform` ([workflow](../engineering/database_migrations_workflow.md)) |
| `REDIS_URL` | no | `redis://localhost:6379/0` | `redis://redis:6379/0` | Read only by `getRedisClient()`, which nothing calls today. The "Redis" cache is an in-memory map |
| `REDIS_KEY_PREFIX` | no | `sineva:platform:` | not set | Prefix of cache keys in the in-memory cache |
| `S3_ENDPOINT` | yes | `http://localhost:8333` | `http://seaweedfs-s3:8333` | Also baked into presigned URLs, so a browser needs a host it can reach ([ADR-0002](../decisions/0002-seaweedfs-presigned-uploads.md)) |
| `S3_REGION` | no | `us-east-1` | `us-east-1` | |
| `S3_ACCESS_KEY_ID` | yes | `sineva_s3_key` (debt) | `sineva_s3_key` (hardcoded) | |
| `S3_SECRET_ACCESS_KEY` | yes | `sineva_s3_secret` (debt) | `sineva_s3_secret` (hardcoded) | |
| `S3_BUCKET_NAME` | no | `sineva-assets` | `sineva-assets` | Shown in the health response |
| `S3_FORCE_PATH_STYLE` | no | true | `"true"` | True unless the value is exactly `false`. SeaweedFS needs path style |
| `AI_ENGINE_INTERNAL_URL` | yes | `http://sineva-ai:8000` | `http://sineva-ai:8000` | Never publish this host ([R-29](../governance/agent_rules.md)) |
| `AI_ENGINE_INTERNAL_API_KEY` | yes | `sineva_internal_service_token_dev` (debt) | `${AI_ENGINE_INTERNAL_API_KEY:-sineva_internal_service_token_dev}` | Sent as `X-Internal-Api-Key`. Must equal `INTERNAL_API_KEY` in `sineva-ai` (below) |
| `AI_ENGINE_TIMEOUT_MS` | no | `15000` | not set | Chat request timeout. Parsed with `Number()`; see the gotcha below |

All of these are server-only. `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_API_BASE_URL` are set in compose, but nothing under `apps/web/src` reads them. They are not secrets. Next.js inlines `NEXT_PUBLIC_*` values into the client bundle at build time (recalling Next.js behavior, not tested here), so setting them only in the container's runtime environment would not change a bundle that is already built.

### Gotchas

- Matching key. `AI_ENGINE_INTERNAL_API_KEY` (platform) and `INTERNAL_API_KEY` (`sineva-ai`) must hold the same value. Compose guarantees it by reading the host variable `AI_ENGINE_INTERNAL_API_KEY` for both services, with the same default. Outside compose, set both yourself. A mismatch makes `sineva-ai` answer 401, which the platform reports as a 502 ([troubleshooting](../troubleshooting/docker_and_internal_network.md)).
- Bad timeout. `Number('abc')` is `NaN`. Node clamps a `NaN` timer delay to 1 ms (checked on Node 24.21.0), so a non-numeric `AI_ENGINE_TIMEOUT_MS` makes every chat request abort at once and return a 503 that looks like the engine is down.
- Silent fallbacks. In production, an unset `DATABASE_URL` or `S3_*` variable does not fail. The app connects to `localhost` with the dev credentials. This breaks the spirit of [ADR-0008](../decisions/0008-no-silent-fallbacks.md) and is known debt. Check the container's environment (`docker compose exec sineva-platform env`) when a deployed app behaves as if it has the wrong database.

## Prisma tooling

| Variable | Read by | Behavior |
| :--- | :--- | :--- |
| `DATABASE_URL` | `prisma.config.ts` | `process.env.DATABASE_URL ?? ''`. Empty is allowed so `prisma generate`, `build` and `typecheck` work with no database. Commands that connect fail on the empty URL |
| `DATABASE_URL` | `prisma/seed.ts` | Throws `DATABASE_URL is required to seed the database` if unset |

`prisma.config.ts` calls `process.loadEnvFile` on `.env` and then `../../.env`, relative to `apps/web`. It never overrides a variable that is already set, so the precedence is: shell or CI environment, then `apps/web/.env`, then the repo-root `.env`. Missing files are ignored.

## Tests and turbo

| Variable | Used by | Notes |
| :--- | :--- | :--- |
| `TEST_DATABASE_URL` | `npm run test:integration` | Required there only. The database name must contain "test". Listed in `turbo.json` under `test:integration`, so turbo passes it through |

Unit tests stub the variables they need (`AI_ENGINE_INTERNAL_URL`, `AI_ENGINE_INTERNAL_API_KEY`, `AI_ENGINE_TIMEOUT_MS`) with `vi.stubEnv` and need no `.env`.

## Compose-level variables

These are read by `docker-compose.yml` itself for substitution, from the shell or from a root `.env` (compose reads `.env` next to the compose file by default; recalling compose behavior).

| Variable | Default | Used for |
| :--- | :--- | :--- |
| `POSTGRES_USER` | `sineva_user` | Postgres container user, and the `DATABASE_URL` of both services |
| `POSTGRES_PASSWORD` | `sineva_secret_password` (debt) | Same |
| `POSTGRES_DB` | `sineva_platform` | The shared database name |
| `AI_ENGINE_INTERNAL_API_KEY` | `sineva_internal_service_token_dev` (debt) | Passed to the platform as `AI_ENGINE_INTERNAL_API_KEY` and to `sineva-ai` as `INTERNAL_API_KEY` |

Compose also sets these on `sineva-ai` directly: `APP_ENV=production`, `DATABASE_URL` (a `postgresql+asyncpg://` URL to the same database), `REDIS_URL=redis://redis:6379/1`, `QDRANT_URL=http://qdrant:6333`, `S3_ENDPOINT=http://seaweedfs-s3:8333`, `INTERNAL_API_KEY`. The platform uses Redis database 0 and `sineva-ai` uses database 1. `sineva-ai` has further settings (for example `ENFORCE_INTERNAL_AUTH`, default on) that compose does not set; they are documented in that repo.

The `Dockerfile` sets `NEXT_TELEMETRY_DISABLED=1`, `NODE_ENV=production` (runner stage), `PORT=3000` and `HOSTNAME=0.0.0.0`.

## Known debt

- Hardcoded default secrets: the Postgres password, the S3 key pair and the internal API key appear as defaults in `getEnvConfig()` and `docker-compose.yml`. Rotate all of them in any shared environment (R-28).
- No startup validation: required variables fall back instead of failing fast.
- `REDIS_URL` and the Redis client exist but nothing uses them.
- `NEXT_PUBLIC_*` values in compose are unused.
