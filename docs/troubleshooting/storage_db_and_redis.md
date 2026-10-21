---
title: "Storage, Postgres and Redis Troubleshooting"
category: "troubleshooting"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "troubleshooting", "postgresql", "prisma", "redis", "seaweedfs", "s3", "migrations"]
summary: "Symptoms and fixes for Prisma connection errors, missing schema or seed data, migration history in the wrong schema, reset prompts, presigned uploads and the in-memory cache."
related_docs:
  - "README.md"
  - "common_issues.md"
  - "docker_and_internal_network.md"
  - "../engineering/database_conventions.md"
  - "../engineering/database_migrations_workflow.md"
  - "../deployment/environment_variables.md"
  - "../decisions/0002-seaweedfs-presigned-uploads.md"
---

# Storage, Postgres and Redis Troubleshooting

Symptom, cause, fix. The shared database is also used by `sineva-ai`, so anything that could write or drop data waits until you have checked the target host and database name (R-18). Messages marked "expected" were not reproduced.

## Postgres

### P1001 from a Prisma command

`Error: P1001: Can't reach database server at host:port` (reproduced).

Cause: nothing is listening there. Wrong port, the container is down, or you are inside a container and used `localhost`.

Fix:

```bash
docker ps --filter "name=sineva-postgres"
docker exec sineva-postgres pg_isready -U sineva_user -d sineva_platform
```

From your host, compose publishes Postgres on 5432, so use `localhost:5432`. From another container on `sineva_internal`, use `postgres:5432`. For the throwaway test container the port is 55432.

### P1000

`P1000` is Prisma's "authentication failed against database server" (expected; recalled, not reproduced). The user or password in `DATABASE_URL` does not match `POSTGRES_USER` and `POSTGRES_PASSWORD`. Changing those variables does not change an existing volume's credentials; the volume keeps the ones it was created with.

### The app returns 500 or hangs on connect

The runtime client has a 5 second connect timeout, so an unreachable database fails after about 5 seconds instead of hanging. Route errors that are not domain errors return 500 with the raw error message.

Check, in order: the host part of the container's `DATABASE_URL` is `postgres` and not `localhost`; the password matches the volume; `docker compose ps` shows `sineva-postgres` healthy. If `DATABASE_URL` was never set in a deployed container, `getEnvConfig()` falls back to `localhost` with the dev credentials and fails to connect ([environment variables](../deployment/environment_variables.md)).

The health endpoint does not help here: it reports Postgres `healthy` whenever `DATABASE_URL` is set. Test the database with `GET /api/v1/agents`, which queries it on a cache miss.

### `relation "platform.agent_configs" does not exist`

Cause: migrations were not applied to this database. Compose starts services but does not migrate.

Fix: run the release step with `?schema=platform` on the URL ([migrations workflow](../engineering/database_migrations_workflow.md#deploy)). Confirm the tables:

```bash
docker exec sineva-postgres psql -U sineva_user -d sineva_platform -c '\dt platform.*'
```

### Dashboard or `/api/v1/agents` is empty

The tables exist but hold no rows. Run `npm --workspace=@sineva/web run db:seed` against the database. It is idempotent. If rows exist but are duplicated or the slugs start with `sino-`, see [stale slugs](docker_and_internal_network.md#stale-sino--rows).

### `Agent 'x' has unknown category` (or status, or capabilities)

Symptom: `GET /api/v1/agents` returns 500 with a message like `Agent 'x' has unknown category 'y'`.

Cause: a row has a value the domain does not accept. Columns are free text, so any writer can store one. The adapter throws on purpose, and one bad row fails the whole page.

Fix: correct the row (valid categories are `people_hr`, `finance_ops`, `sales_growth`, `social_marketing`, `customer_support`, `data_insights`; statuses are `online`, `standby`, `busy`, `maintenance`; `capabilities` must be an array of strings) or delete it. Find who wrote it.

### Migration history in `public`

Symptom: `migrate deploy` with `?schema=platform` fails with `P3005`, or `_prisma_migrations` appears under `public`. Cause: an earlier deploy used a plain URL. Fix: the recovery steps in the [migrations workflow](../engineering/database_migrations_workflow.md#recovery). Do not drop objects to make the error go away.

### A reset or drift prompt

Prisma says it needs to reset the schema, or reports drift. Never accept it on a shared or persistent database: a reset can drop data and objects that belong to `sineva-ai`. Stop, print the target host and database, and run `prisma migrate status` with the `?schema=platform` URL. On a throwaway container, a reset is fine. Rules R-18 and R-19.

### Data disappeared after a restart or a "cleanup"

`npm run docker:down` runs `docker compose down -v` and deletes the Postgres volume, including `sineva-ai`'s data. After it, both services need their migrations again (the platform's `migrate deploy` and `seed`, and the engine's `alembic upgrade head`). Use `docker compose down` to keep data.

## SeaweedFS and presigned uploads

### Upload to `upload_url` fails

`SignatureDoesNotMatch`, `NoSuchBucket`, `AccessDenied`, or a hostname the browser cannot resolve.

1. Look at the URL the presign call returned. A valid one carries `X-Amz-Signature`. If it has only `X-Amz-Expires`, signing threw inside `SeaweedStorageRepository.createPresignedUploadUrl`, which returns an unsigned URL instead of failing (known debt). Look for the cause in the container's logs and in the S3 variables.
2. Check the host in the URL. It comes from `S3_ENDPOINT`, which compose sets to `http://seaweedfs-s3:8333`, a name only containers can resolve. A browser outside Docker needs an endpoint it can reach ([ADR-0002](../decisions/0002-seaweedfs-presigned-uploads.md)).
3. Path-style addressing must be on (`S3_FORCE_PATH_STYLE` unset or `true`): `http://host:8333/sineva-assets/<key>`.
4. The `PUT` must send the same `Content-Type` that was passed to presign (`content_type`).
5. Check the S3 gateway: `docker logs sineva-seaweedfs-s3 --tail 50`.

The health endpoint reports S3 `healthy` whenever an endpoint is configured, without contacting it.

## Redis and the cache

Current: the platform does not use Redis. `RedisCacheRepository` keeps entries in an in-memory `Map` inside the Next.js process, `ping()` always returns true, and `REDIS_URL` is read only by a client that nothing calls. So:

- `redis-cli KEYS "sineva:platform:*"` finds nothing from the platform. Do not conclude Redis is broken.
- The health endpoint shows Redis `healthy` even when Redis is stopped.
- The cache is per process and lost on restart. List results are cached for 30 seconds. After `POST /api/v1/agents`, only the page-1 key for 10 per page is cleared, so the dashboard (20 per page) can show the old list for up to 30 seconds.

Compose points `sineva-ai` at Redis database 1 (`redis://redis:6379/1`) and the platform's configured database is 0. Whether `sineva-ai` currently writes to it is not checked here.
