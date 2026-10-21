---
title: "Docker Compose Topology"
category: "deployment"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "docker", "docker-compose", "postgres", "redis", "seaweedfs", "qdrant", "topology"]
summary: "The nine services in docker-compose.yml, which ports each publishes to the host, volumes, startup order, and the commands that can destroy data."
related_docs:
  - "README.md"
  - "internal_network_security.md"
  - "environment_variables.md"
  - "ci_cd_pipeline.md"
  - "../engineering/database_migrations_workflow.md"
  - "../troubleshooting/docker_and_internal_network.md"
  - "../decisions/0001-bff-gateway.md"
---

# Docker Compose Topology

The root `docker-compose.yml` runs the whole Sineva stack on one bridge network, `sineva_internal`: shared Postgres, Redis, SeaweedFS (four processes), Qdrant, the internal AI engine `sineva-ai`, and the public web app `sineva-platform`. It is the only compose file in the repo.

## Services and ports

"Host port" is what the compose file publishes. A `ports:` entry such as `"5432:5432"` binds on all host interfaces.

| Service | Container | Image or build | Internal address | Host port | Role |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `sineva-platform` | `sineva-platform` | `./Dockerfile` | `sineva-platform:3000` | 3000 | Next.js 16.4 web app and BFF, the public entry point |
| `sineva-ai` | `sineva-ai` | `../sineva-ai/Dockerfile` | `sineva-ai:8000` | none (`expose` only) | Internal FastAPI AI engine |
| `postgres` | `sineva-postgres` | `postgres:17-alpine` | `postgres:5432` | 5432 | Shared Postgres 17, database `sineva_platform` |
| `redis` | `sineva-redis` | `redis:7.4-alpine` | `redis:6379` | 6379 | Redis with append-only persistence |
| `seaweedfs-master` | `sineva-seaweedfs-master` | `chrislusf/seaweedfs:latest` | `seaweedfs-master:9333` | 9333 | SeaweedFS coordinator |
| `seaweedfs-volume` | `sineva-seaweedfs-volume` | `chrislusf/seaweedfs:latest` | `seaweedfs-volume:8080` | none | SeaweedFS volume server |
| `seaweedfs-filer` | `sineva-seaweedfs-filer` | `chrislusf/seaweedfs:latest` | `seaweedfs-filer:8888` | 8888 | SeaweedFS filer |
| `seaweedfs-s3` | `sineva-seaweedfs-s3` | `chrislusf/seaweedfs:latest` | `seaweedfs-s3:8333` | 8333 | S3 gateway |
| `qdrant` | `sineva-qdrant` | `qdrant/qdrant:v1.13.4` | `qdrant:6333` | 6333 | Vector store used by `sineva-ai` |

Two things follow from this table.

- `sineva-ai` is the one service that must stay unreachable from the host, and it is ([R-29](../governance/agent_rules.md)). `localhost:8000` does not answer from your machine by design.
- Everything else with a `ports:` entry is reachable from the host, including Postgres, Redis (no password is set) and Qdrant. That suits a development machine. On a server, bind them to `127.0.0.1` or remove the entries; the "platform is the only public entry" claim ([ADR-0001](../decisions/0001-bff-gateway.md)) holds for application traffic, not for these data-store ports. `seaweedfs-volume` also publishes nothing.

`seaweedfs:latest` is not pinned. The others are pinned to a tag.

## Startup order

- `postgres` and `redis` have healthchecks (`pg_isready`, `redis-cli ping`, every 10 seconds, 5 retries).
- `sineva-ai` waits for healthy `postgres` and `redis` and for `qdrant` to have started.
- `sineva-platform` waits for healthy `postgres` and `redis` and for `seaweedfs-s3` to have started. It does not wait for `sineva-ai`; the gateway handles an unreachable engine with a 503.
- `sineva-platform` and `sineva-ai` have no healthcheck of their own.

Gotcha: compose starts the services but runs no migrations. On a new database the `platform` schema does not exist yet, so the dashboard (`force-dynamic`, queries the database per request) and `GET /api/v1/agents` fail until the release step in [CI/CD pipeline](ci_cd_pipeline.md) has run `db:migrate:deploy`, and the companion list stays empty until `db:seed`. `sineva-ai` has its own `alembic upgrade head` step.

Prerequisite: `sineva-ai` builds from `../sineva-ai`, so that repository must be checked out next to this one. Known cross-repo debt: its Docker build is currently broken because a README is not copied into the image, so `docker compose up --build` can fail on that service.

## Volumes

Named volumes keep state across restarts: `postgres_data`, `redis_data`, `seaweed_master_data`, `seaweed_volume_data`, `qdrant_data`. `seaweedfs-filer` and `seaweedfs-s3` mount none. `postgres_data` holds the platform schema and the `sineva-ai` schema together.

## Commands

```bash
npm run docker:up                          # docker compose up -d --build
docker compose logs -f sineva-platform sineva-ai
docker compose down                        # stop and remove containers, keep volumes
docker compose up -d --force-recreate sineva-ai sineva-platform   # re-read env (for example after changing the shared key)
```

Danger: `npm run docker:down` is `docker compose down -v`. The `-v` deletes every named volume, including `postgres_data`, which also holds `sineva-ai`'s data. There is no confirmation prompt. To stop the stack, use `docker compose down` without `-v`. Delete volumes only on a machine whose data you can lose, and only on purpose.

Variables that change behavior of this stack are listed in [environment variables](environment_variables.md).
