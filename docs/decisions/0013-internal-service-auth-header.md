---
title: "ADR-0013: Internal service auth header X-Internal-Api-Key"
category: "decisions"
status: "active"
version: "1.1.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "security", "internal-api", "sineva-ai", "headers"]
summary: "The platform authenticates to sineva-ai with the X-Internal-Api-Key header, the one sineva-ai enforces, and compose passes one shared value to both services."
related_docs:
  - "0001-bff-gateway.md"
  - "0008-no-silent-fallbacks.md"
  - "0016-upstream-failures-return-502-503.md"
  - "../deployment/internal_network_security.md"
  - "../deployment/environment_variables.md"
adr_id: "0013"
decision_status: "Accepted"
supersedes: []
---

# ADR-0013: Internal service auth header X-Internal-Api-Key

## Status

Accepted (2026-10-21). Implemented.

Cross-service: mirrored in sineva-ai `docs/decisions/` (a sineva-ai ADR of the same title; that folder does not exist yet, so no number is cited). Change both repos together.

## Context

`sineva-ai` enforces a shared-secret header on its internal API (`presentation/middlewares/internal_network_guard.py`). The platform used to send a different header name, `X-Internal-Service-Token`. That was a bug: `sineva-ai` rejects those calls.

The bug stayed hidden because the AI gateway had a silent fallback. When `sineva-ai` returned a non-OK response, the gateway answered with a canned reply instead of surfacing an error ([ADR-0008](0008-no-silent-fallbacks.md)). The chat appeared to work while never reaching the engine. The fallback is deleted, so the same mistake now returns a 502 ([ADR-0016](0016-upstream-failures-return-502-503.md)).

## Decision

- The internal header is `X-Internal-Api-Key`.
- On the `sineva-ai` side the secret is read from the environment variable `INTERNAL_API_KEY`.
- On the platform side it is `AI_ENGINE_INTERNAL_API_KEY` (read in `getEnvConfig()` and sent by `InternalAiEngineGateway`). Both variables must hold the same value in a given environment.
- `docker-compose.yml` sets both from one variable, `${AI_ENGINE_INTERNAL_API_KEY:-sineva_internal_service_token_dev}`: it becomes `INTERNAL_API_KEY` for `sineva-ai` and `AI_ENGINE_INTERNAL_API_KEY` for the platform, so the two sides cannot drift under compose.
- Every platform request to `sineva-ai`, including health checks, sends the header.
- Code that sends `X-Internal-Service-Token` is a defect. A contract test asserts the legacy header is never sent.

## Consequences

- The header is a shared service secret between two services. It is not a user identity, and it does not replace user authentication, which does not exist yet.
- The default value of `AI_ENGINE_INTERNAL_API_KEY` is hardcoded in `server/infrastructure/config/env.ts` and `docker-compose.yml` (`sineva_internal_service_token_dev`). That is known debt: production must set its own secret, and new code must not add more hardcoded secret defaults (rule R-28 in [agent rules](../governance/agent_rules.md)).
- Secrets never go into `NEXT_PUBLIC_*` variables, which ship to the browser.
- A wrong or missing key shows up as a 502 on chat (`sineva-ai` answers 401). It does not show up on the health check: in `sineva-ai` the key guard is on the agents, chat, mcp and workflows routers, and `/api/v1/health` is not guarded, so a green health check does not prove the key matches. To verify against a real `sineva-ai`, send one chat request and expect a 200 with a `message_id`.

## Alternatives considered

- Keep `X-Internal-Service-Token` on the platform and change `sineva-ai`. Rejected: `sineva-ai` already enforces `X-Internal-Api-Key`, so changing the caller is the smaller change.
- Stronger service authentication (signed tokens, mutual TLS). Not decided here.
