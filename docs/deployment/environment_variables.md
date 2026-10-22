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

`getEnvConfig()` validates the environment once (`validateEnvConfig` in `server/infrastructure/config/env.ts`) and caches the result. The code holds no default for a credential. "Secret" below means the variable is required in every environment: production reads it from its secret store, development and tests load it from `.env.example` (`getEnvConfig` calls `process.loadEnvFile` on `.env`, `../../.env`, `.env.example` and `../../.env.example` when `NODE_ENV` is not `production`, and never overrides a variable that is already set). In production, a secret that is missing, blank or recognizable as a development value (a known legacy credential, or a value with a `dev`, `example`, `placeholder`, `changeme` or `insecure` word between separators) stops startup.

| Variable | Required | Default in code | Compose value | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | no | `development` | `production` | Next sets it. Production turns on the strict checks above |
| `DATABASE_URL` | secret | none | `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}` | Runtime URL: plain, no `?schema=`. The health check runs `SELECT 1` against it. For `migrate deploy` it must end in `?schema=platform` ([workflow](../engineering/database_migrations_workflow.md)) |
| `REDIS_URL` | production | `redis://localhost:6379/0` | `redis://redis:6379/0` | The cache and the health `PING` use it. There is no in-memory fallback when Redis is down |
| `REDIS_KEY_PREFIX` | no | `sineva:platform:` | not set | Prefix of every cache key |
| `S3_ENDPOINT` | production | `http://localhost:8333` | `http://seaweedfs-s3:8333` | Server-to-storage calls (the `HeadBucket` health probe) |
| `S3_PUBLIC_ENDPOINT` | production | `S3_ENDPOINT` outside production | `${S3_PUBLIC_ENDPOINT:-http://localhost:8333}` | Host baked into presigned URLs. Must be reachable by the browser ([ADR-0002](../decisions/0002-seaweedfs-presigned-uploads.md)). Required in production so URLs never carry the Docker name |
| `S3_REGION` | no | `us-east-1` | `us-east-1` | |
| `S3_ACCESS_KEY_ID` | secret | none | `${S3_ACCESS_KEY_ID:?...}` | |
| `S3_SECRET_ACCESS_KEY` | secret | none | `${S3_SECRET_ACCESS_KEY:?...}` | |
| `S3_BUCKET_NAME` | no | `sineva-assets` | `sineva-assets` | Shown only to staff in the health response |
| `S3_FORCE_PATH_STYLE` | no | true | `"true"` | True unless the value is exactly `false`. SeaweedFS needs path style |
| `AI_ENGINE_INTERNAL_URL` | production | `http://sineva-ai:8000` | `http://sineva-ai:8000` | Never publish this host ([R-29](../governance/agent_rules.md)) |
| `AI_ENGINE_INTERNAL_API_KEY` | secret | none | `${AI_ENGINE_INTERNAL_API_KEY:?...}` | Sent as `X-Internal-Api-Key`. Must equal `INTERNAL_API_KEY` in `sineva-ai` (below) |
| `AI_ENGINE_INTERNAL_API_KEY_NEXT` | no | none | not set | Second key accepted during rotation |
| `AI_ENGINE_TIMEOUT_MS` | no | `15000` | not set | Chat request timeout. An integer from 1000 to 300000, otherwise startup fails |
| `AUTH_SECRET` | secret | none | `${AUTH_SECRET:?...}` | At least 32 characters in production |
| `INTERNAL_CONTEXT_SIGNING_KEY` | secret | none | `${INTERNAL_CONTEXT_SIGNING_KEY:?...}` | Signs the internal context sent to `sineva-ai` |
| `INTERNAL_CONTEXT_KID` | production | `k1` | `${INTERNAL_CONTEXT_KID:-k1}` | Key id of the signing key |
| `EMAIL_FROM`, `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`, `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD` | no | none | not set | SMTP transport. With no host the sender is a fake that sends nothing |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | no | none | not set | Provider sign-in |

All of these are server-only. `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_API_BASE_URL` are not secrets. Next.js inlines `NEXT_PUBLIC_*` values into the client bundle at build time (recalling Next.js behavior, not tested here), so setting them only in the container's runtime environment would not change a bundle that is already built.

### Gotchas

- Matching key. `AI_ENGINE_INTERNAL_API_KEY` (platform) and `INTERNAL_API_KEY` (`sineva-ai`) must hold the same value. Compose guarantees it by reading the host variable `AI_ENGINE_INTERNAL_API_KEY` for both services. Outside compose, set both yourself. A mismatch makes `sineva-ai` answer 401, which the platform reports as a 502 ([troubleshooting](../troubleshooting/docker_and_internal_network.md)).
- Compose refuses to start without the secrets. `docker compose up` fails with the `${VAR:?message}` text when `POSTGRES_PASSWORD`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `AI_ENGINE_INTERNAL_API_KEY`, `AUTH_SECRET` or `INTERNAL_CONTEXT_SIGNING_KEY` is unset. Put the values in a `.env` next to `docker-compose.yml`; never commit it.
- Development values do not work in production. Copying `.env.example` into a production environment makes startup fail on purpose.

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

- `NEXT_PUBLIC_*` values in compose are unused.
