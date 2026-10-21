---
title: "ADR-0003: snake_case wire contract and response envelope"
category: "decisions"
status: "active"
version: "1.1.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "api", "snake-case", "contract", "openapi"]
summary: "Every JSON key on the wire is snake_case, and every response uses the @sineva/shared envelope through response_helper."
related_docs:
  - "0005-prisma-replaces-drizzle.md"
  - "../engineering/response_pattern.md"
  - "../engineering/database_conventions.md"
  - "../api-spec/overview.md"
  - "../api-spec/swagger_and_openapi.md"
adr_id: "0003"
decision_status: "Accepted"
supersedes: []
---

# ADR-0003: snake_case wire contract and response envelope

## Status

Accepted (2026-10-21).

Cross-service: mirrored in sineva-ai `docs/decisions/` (a sineva-ai ADR of the same title; that folder does not exist yet, so no number is cited). Change both repos together.

## Context

Three systems exchange the same data: the TypeScript platform, Postgres, and the Python `sineva-ai` service (Pydantic and SQLAlchemy, which use snake_case by convention). A camelCase wire format would need a key-mapping step at each boundary, and a missed mapping fails silently as an `undefined` field.

## Decision

- JSON keys in request bodies, query parameters, response bodies and response `meta` are `snake_case` (`agent_slug`, `per_page`, `message_text`, `total_items`).
- Database tables and columns are `snake_case` ([ADR-0005](0005-prisma-replaces-drizzle.md)).
- Every response is built with `createSuccessResponse`, `createPaginatedResponse` or `createErrorResponse` from `@sineva/shared`, called through `src/server/http/response_helper.ts`. Handlers never hand-build the envelope.
- The envelope has the fields `success`, `status`, `message`, `data`, `meta` and `errors`. Paginated responses carry `page`, `per_page`, `total_items`, `total_pages`, `has_next` and `has_prev` in `meta`, plus `request_id` and `timestamp`.
- Every new route is registered in the OpenAPI document (`src/server/infrastructure/openapi/spec.ts`, served at `/api/openapi.json`).

The rule covers data that crosses a boundary: HTTP, the database, cache values. It does not rename TypeScript methods or local variables.

## Consequences

- No mapping layer between the wire, the database and `sineva-ai`.
- No test enforces key casing on routes. `assertSnakeCaseKeys` in `packages/shared/src/snake_case.ts` checks top-level keys only and is called only by the `packages/shared` tests. The convention is held by review and by the typed views (known debt API-7).
- TypeScript code that reads wire data uses snake_case property names, which some linters flag. Do not add camelCase aliases to get around it.
- Third-party payloads (for example Next.js internals) keep their own casing. Convert at the adapter, not in the domain.

## Alternatives considered

- camelCase on the wire with mapping at each edge. Rejected: every boundary needs a mapper, and a missed mapper corrupts data without an error.
