---
title: "Docker and Internal Network Debugging"
category: "troubleshooting"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "troubleshooting", "docker", "sineva_internal", "sineva-ai", "502", "503", "contract"]
summary: "How to tell apart a missing header, a wrong key, an unknown slug, a contract mismatch and an unreachable engine when chat returns 404, 422, 502 or 503, plus network checks between sineva-platform and sineva-ai."
related_docs:
  - "README.md"
  - "common_issues.md"
  - "storage_db_and_redis.md"
  - "../deployment/docker_compose_topology.md"
  - "../deployment/internal_network_security.md"
  - "../deployment/environment_variables.md"
  - "../decisions/0016-upstream-failures-return-502-503.md"
  - "../decisions/0015-sineva-ai-owns-internal-chat-contract.md"
---

# Docker and Internal Network Debugging

`sineva-ai` publishes no host port, so `http://localhost:8000` is unreachable from your machine on purpose. Everything below happens inside the `sineva_internal` network or in container logs. Commands in this page were derived from the compose file and the gateway code; they were not run against a live stack.

## Chat returns an error: triage

Chat goes browser, then `POST /api/v1/agents/{agent_slug}/chat` on the platform, then `sineva-ai`. Start with the status the platform returned.

| Platform response | Where it came from | Go to |
| :--- | :--- | :--- |
| 404 `RESOURCE_NOT_FOUND`, "Agent 'x' was not found" | The platform's own database has no `agent_configs` row with that slug. The engine was never called | Wrong or old slug, or the seed has not run: [stale slugs](#stale-sino--rows) |
| 422 `VALIDATION_ERROR` | The platform's Zod schema rejected the body. The engine was never called | `errors[].field` names the field ([common issues](common_issues.md)) |
| 502 `UPSTREAM_ERROR` | The engine answered, but not with a usable reply | The log table below |
| 503 `UPSTREAM_UNAVAILABLE` | The engine could not be reached, or did not answer in time | The log table below |

The platform never passes the engine's status through. Any non-2xx from `sineva-ai` (401, 404, 422, 5xx) becomes 502, and so does an invalid body ([ADR-0016](../decisions/0016-upstream-failures-return-502-503.md)). The real cause is in the platform log, where the gateway writes one line per failure and, for non-2xx, the first 500 characters of the engine's body:

```bash
docker compose logs --tail 200 sineva-platform | grep "\[ai-engine\]"
```

| Log line | You get | Meaning | Check |
| :--- | :--- | :--- | :--- |
| `chat request failed` with `aborted: false` | 503 | Could not connect: engine down, wrong `AI_ENGINE_INTERNAL_URL`, or not on the network | `docker compose ps`, the network check below |
| `chat request failed` with `aborted: true` | 503 | No complete reply within `AI_ENGINE_TIMEOUT_MS` (default 15000) | Slow model call: read `sineva-ai` logs, raise the timeout. If it fails at once, the value is not a number (it becomes a 1 ms timer) |
| `chat returned non-2xx`, `status: 401` | 502 | Auth failed. The body's `error_code` is `unauthorized_internal_call` | Body says `Missing required 'X-Internal-Api-Key' header`: the platform did not send the header (old build still sending the legacy token header). Body says `Invalid 'X-Internal-Api-Key' header provided.`: the keys differ, see below |
| `chat returned non-2xx`, `status: 404` | 502 | `error_code` `agent_not_found`: the engine does not know this slug. `session_not_found`: it does not know this `session_id` | Compare slugs on both sides ([stale slugs](#stale-sino--rows)). For a session, the engine lost it (restart) or the client sent an old id: omit `session_id` to start a new one |
| `chat returned non-2xx`, `status: 422` | 502 | `validation_error`: the engine rejected the request body; `errors[].field` names the field. `agent_inactive`: the companion is disabled on the engine side | For validation: the request contract drifted, see below |
| `chat returned non-2xx`, `status: 5xx` | 502 | The engine failed | `docker compose logs sineva-ai` |
| `chat returned non-JSON body` | 502 | Something other than the engine answered (proxy page, wrong port) | `AI_ENGINE_INTERNAL_URL` |
| `chat body failed contract validation` with `issues` | 502 | Status was 2xx but the body does not match the platform's Zod envelope. Each issue has a `path` and a `message` | Contract drift, see below |

### Key mismatch

`AI_ENGINE_INTERNAL_API_KEY` (platform) and `INTERNAL_API_KEY` (`sineva-ai`) must be equal. Compare without printing the secrets:

```bash
docker compose exec sineva-platform sh -c 'printf %s "$AI_ENGINE_INTERNAL_API_KEY" | sha256sum'
docker compose exec sineva-ai sh -c 'printf %s "$INTERNAL_API_KEY" | sha256sum'
```

Different hashes mean a mismatch. Fix the shared value in the environment compose reads, then recreate both services so they start together:

```bash
docker compose up -d --force-recreate sineva-ai sineva-platform
```

### Contract drift (422 request, or response validation)

`sineva-ai` owns the chat contract; the platform adapts to it ([ADR-0015](../decisions/0015-sineva-ai-owns-internal-chat-contract.md)). Request side: the platform sends exactly `user_message`, `session_id`, `user_id` and `context_metadata`, and the engine's request model forbids unknown keys. Response side: the platform validates the success envelope and ignores extra fields, but fails on a missing or mistyped one (a `created_at` that is not an ISO datetime, a `document_id` that is not a UUID, a missing `reply_content`).

1. Read the failing field from the log (`errors[].field` or `issues[].path`).
2. Run `npm run test`. The contract test replays the fixtures in `apps/web/src/__tests__/contract/fixtures/`. If it passes, the fixtures match the gateway, so look at whether the engine and the fixtures differ.
3. Compare the fixtures with `sineva-ai/tests/contract/fixtures/`. They must be byte for byte equal (R-40). If `sineva-ai` changed its contract, copy its fixtures here, update the gateway and the tests, and ship both repos together. Do not edit the fixture copies by hand.

### Health says `standby`

`GET /api/v1/health` reports `data.subsystems.sineva_ai_engine.status` as `standby` when the engine call throws or returns a non-2xx status. A key mismatch (401) and a stopped engine therefore look the same there. The health call times out after 1.2 seconds. The version is read from the engine's health body (`unknown` when the body has none), and anonymous callers see only the overall `status`, so use the log table above for the cause.

## Network checks

Both containers must be on `sineva_internal`:

```bash
docker network inspect sineva_internal --format '{{range .Containers}}{{.Name}}{{"\n"}}{{end}}'
```

The list should include `sineva-platform`, `sineva-ai`, `sineva-postgres`, `sineva-redis`, `sineva-qdrant` and the SeaweedFS containers. Then probe the engine from inside the platform container, with the container's own key:

```bash
docker compose exec sineva-platform sh -c \
  'wget -qO- --header="X-Internal-Api-Key: $AI_ENGINE_INTERNAL_API_KEY" http://sineva-ai:8000/api/v1/health'
```

An answer means DNS, the network and the key all work. "bad address" means the container is not on the network or `sineva-ai` is not running. A 401 means the key differs.

## Stale `sino-*` rows

Symptom: the dashboard lists each product twice, or chat to an old slug returns 502 with a logged `agent_not_found`.

Cause: the database was seeded before the slugs were made canonical. The seed upserts by slug, so it added `sinopeople` and the rest next to the old `sino-people` rows instead of renaming them. `sineva-ai` only knows the canonical slugs.

Fix: run the slug data fix in the [migrations workflow](../engineering/database_migrations_workflow.md#old-sino--slugs), on a copy first.
