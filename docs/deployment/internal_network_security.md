---
title: "Internal Network Security"
category: "deployment"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "security", "network-isolation", "sineva_internal", "api-key", "secrets"]
summary: "How sineva-ai is kept off the host network and authenticated with X-Internal-Api-Key, which variables may reach the browser, how to rotate the shared key, and the security gaps that remain."
related_docs:
  - "docker_compose_topology.md"
  - "environment_variables.md"
  - "../troubleshooting/docker_and_internal_network.md"
  - "../decisions/0001-bff-gateway.md"
  - "../decisions/0013-internal-service-auth-header.md"
  - "../governance/agent_rules.md"
---

# Internal Network Security

`sineva-ai` is an internal service. The browser talks to `sineva-platform`, and only `sineva-platform` talks to `sineva-ai` ([ADR-0001](../decisions/0001-bff-gateway.md), R-29). Two controls enforce that, and one gap sits next to them.

## Control 1: no host port

In `docker-compose.yml`, `sineva-ai` has `expose: ["8000"]` and no `ports:` entry. Docker does not bind port 8000 on the host, so only containers on the `sineva_internal` network can resolve `sineva-ai` and connect to `http://sineva-ai:8000`. Check with `docker compose ps`: `sineva-ai` shows `8000/tcp` with no `0.0.0.0:` mapping, and `sineva-platform` shows `0.0.0.0:3000->3000/tcp`.

## Control 2: shared secret on every call

The platform sends `X-Internal-Api-Key` with the value of `AI_ENGINE_INTERNAL_API_KEY` on every request to `sineva-ai`: chat (`POST /api/v1/agents/{slug}/chat`) and the health probe (`GET /api/v1/health`). The gateway is `InternalAiEngineGateway` in `apps/web/src/server/infrastructure/gateways/`. It sends no other auth or tracing header. The old header `X-Internal-Service-Token` was a bug and is gone; the contract test asserts it is never sent ([ADR-0013](../decisions/0013-internal-service-auth-header.md)).

`sineva-ai` compares the header with its `INTERNAL_API_KEY` using `secrets.compare_digest` and answers 401 when the header is missing or wrong. That check can be switched off with its `ENFORCE_INTERNAL_AUTH` setting, which defaults to on and which compose does not set. Keep it on.

Rotating the key: set a new `AI_ENGINE_INTERNAL_API_KEY` in the environment that compose reads, then recreate both containers so both pick it up together:

```bash
docker compose up -d --force-recreate sineva-ai sineva-platform
```

Between the first container restarting and the second, calls fail with 401 on the engine side and 502 on the platform side. Do it when that is acceptable.

## What may reach the browser

Only `NEXT_PUBLIC_*` variables ship to the client, and no secret belongs in one (R-28). Every variable the app actually reads is server-only; the full list is in [environment variables](environment_variables.md). Server modules carry `import 'server-only'`, and the architecture test and ESLint stop client code from importing them.

## Gaps

- Development credentials in `.env.example`. The platform refuses to start in production with any of them, and compose refuses to start without real values, but `sineva-ai` has its own settings and defaults that this repo does not control. Set real values in every shared environment.
- Published data-store ports. Postgres (5432), Redis (6379, no password), Qdrant (6333) and the SeaweedFS master, filer and S3 ports are published on all host interfaces. See the [topology](docker_compose_topology.md). Network isolation protects `sineva-ai` only.
- No user authentication. The platform has no login, `user_id` is trusted from the request body, and `POST /api/v1/storage/presign` takes `workspace_id` from the body. Anyone who can reach port 3000 can call chat and presign (R-27).
