---
title: "ADR-0001: BFF gateway in front of an isolated AI engine"
category: "decisions"
status: "active"
version: "1.1.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "bff", "gateway", "security", "network"]
summary: "sineva-platform is the only public entry point; sineva-ai is reachable only through it over the internal Docker network."
related_docs:
  - "0013-internal-service-auth-header.md"
  - "0004-web-app-structure-and-dependency-rules.md"
  - "../project-structure/overview.md"
  - "../deployment/internal_network_security.md"
adr_id: "0001"
decision_status: "Accepted"
supersedes: []
---

# ADR-0001: BFF gateway in front of an isolated AI engine

## Status

Accepted (2026-10-21).

## Context

Sineva runs two services:

- `sineva-platform`: Next.js, the web UI and its server side.
- `sineva-ai`: a Python FastAPI service that runs the AI work (Agno, MCP tools, Qdrant, SQLAlchemy).

Exposing both to the public network means two CORS configurations, two places to authenticate and validate requests, two API catalogs for web clients, and a larger attack surface around the AI engine and its tools.

## Decision

`sineva-platform` is a Backend-for-Frontend (BFF) and the only public entry point (port 3000).

- Browsers call same-origin `/api/v1/*` routes on the platform only.
- `sineva-ai` is declared with `expose: 8000` and no `ports:` mapping in `docker-compose.yml`, so it has no host binding. Only containers on `sineva_internal` can reach it.
- The platform validates request input with Zod at its route handlers, then calls `sineva-ai` through the `AiEngineGateway` port. The adapter is `InternalAiEngineGateway` in `src/server/infrastructure/gateways/`.
- The platform authenticates itself to `sineva-ai` with the internal key header defined in [ADR-0013](0013-internal-service-auth-header.md).

## Consequences

Good:

- The AI engine and its MCP tools cannot be reached from outside the Docker network through `sineva-ai` itself.
- No CORS handling is needed, because the browser never calls a second origin.
- Web clients see one API catalog (`/api/openapi.json`) and one response envelope ([ADR-0003](0003-snake-case-wire-contract.md)).

Limits that exist today (Current, not Target):

- The platform has no user authentication and no rate limiting. It validates input shape only. Until authentication exists, the gateway is a validating proxy, not an access-control boundary. See rule R-27 in [agent rules](../governance/agent_rules.md).
- Isolation covers `sineva-ai` only. `docker-compose.yml` also publishes Postgres (5432), Redis (6379), SeaweedFS (9333, 8888, 8333) and Qdrant (6333) on the host for local development. Do not describe those as unreachable from outside.
- The platform is a single point of failure for every AI feature, and each AI call adds one network hop.
- When `sineva-ai` fails, the platform returns 502 or 503, not a substitute reply ([ADR-0016](0016-upstream-failures-return-502-503.md)). The platform has no fallback engine, so it is down for AI features whenever `sineva-ai` is.

## Alternatives considered

- Expose both services publicly. Rejected: it duplicates authentication and CORS work, splits the API catalog, and exposes the AI engine directly.

## Origin

Replaces `docs/research/bff_gateway_pattern.md`. The earlier text claimed requests are "authenticated, rate-limited" and that the platform serves graceful fallback responses. Neither is implemented (the fallback was removed, [ADR-0008](0008-no-silent-fallbacks.md)), so both claims were dropped.
