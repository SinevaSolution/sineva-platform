---
title: "ADR-0004: Web app structure and dependency rules"
category: "decisions"
status: "active"
version: "1.1.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "architecture", "clean-architecture", "next-js", "server-only"]
summary: "One Next.js app (apps/web) holds routing, backend layers and frontend under src/app, src/server, src/client and src/shared, with import rules enforced by tests and lint."
related_docs:
  - "0001-bff-gateway.md"
  - "0008-no-silent-fallbacks.md"
  - "../project-structure/clean_architecture_layers.md"
  - "../project-structure/frontend_architecture.md"
  - "../project-structure/turborepo_workspaces.md"
  - "../engineering/design_pattern.md"
adr_id: "0004"
decision_status: "Accepted"
supersedes: []
---

# ADR-0004: Web app structure and dependency rules

## Status

Accepted (2026-10-21).

## Context

The first scaffold used four top-level layers under `apps/web/src` (`domain`, `application`, `infrastructure`, `presentation`). Backend and frontend code shared those folders, so nothing stopped a client component from importing a database adapter, and nothing marked which files were safe to ship to the browser.

## Decision

`apps/web` is a single Next.js 16.4 App Router application acting as the BFF ([ADR-0001](0001-bff-gateway.md)). Its source is split by where code runs:

```text
apps/web/src/
  app/                 routing edge only: pages, layouts, route handlers
  server/              backend, never shipped to the browser
    domain/            entities, repository and gateway ports, domain errors
    application/       use cases and Zod DTOs
    infrastructure/    adapters: database, cache, storage, AI gateway, config, OpenAPI
    http/              response_helper and HTTP-level contracts
    container.ts       composition root
  client/              frontend
    components/
    store/             Redux Toolkit
  shared/              wire/view types both sides may import (AgentView, ChatReplyView)
```

Dependency rules:

1. `app` route handlers are thin: parse input with Zod, call a use case obtained from `@/server/container`, and respond through `server/http/response_helper`. They do not import from `@/server/infrastructure`, except the static OpenAPI spec.
2. `server/domain` has no framework and no ORM imports (`next`, `react`, Prisma, `pg`, `ioredis`, AWS SDK). Target: it also imports nothing from `@sineva/shared`. Current debt: `domain/errors/domain_error.ts` has `import type { ErrorDetail } from '@sineva/shared'`.
3. `server/application` depends only on `server/domain`.
4. `server/infrastructure` depends only on `server/domain`. It never imports `application` or `http`.
5. Every file under `server/infrastructure`, and `server/container.ts`, starts with `import 'server-only'`.
6. `server/container.ts` is the only place adapters are constructed. It exposes lazy, memoized getters and does no I/O at import time, so `next build` (which imports every route module) never touches real infrastructure.
7. `client` never imports `@/server/**` or `server-only`. Types the client needs live in `src/shared`.
8. `src/shared/` holds the browser-facing shapes: `agent_view.ts` and `chat_view.ts`. `server/http/agent_view_contract.ts` and `server/http/chat_view_contract.ts` fail the type check if the domain `AgentEntity` or the chat response stops being assignable to its view.

Enforcement:

- `apps/web/src/__tests__/architecture.test.ts` checks the directory layout (and that the old top-level layers are gone), the client boundary, domain purity, that `application` avoids `infrastructure`, `http`, `next` and `react`, that `infrastructure` avoids `application` and `http`, the `server-only` marker, and that `app` does not import infrastructure.
- `apps/web/eslint.config.mjs` applies `no-restricted-imports` to `src/client/**`, blocking `@/server` and `server-only`.
- `apps/web/vitest.config.ts` aliases `server-only` to `src/__tests__/stubs/server_only.ts`. The real module throws outside a React Server Components build, so without the stub any test touching infrastructure or the container would crash.

Not yet enforced by tests: the target "no `@sineva/shared` in domain" rule, and "application imports only domain" (the test blocks specific layers and packages, not every other import).

## Consequences

- A boundary violation fails the test suite or lint, not just review.
- The container is a single place to swap an adapter or to see what the app depends on.
- The container's memoized adapters keep process-wide state, including the Prisma connection pool. There is no reset hook (`resetContainerForTests` was removed). Unit tests build use cases with fakes directly, and route tests mock `@/server/container`.
- Moving code between `server` and `client` needs a deliberate decision about what belongs in `src/shared`.

## Alternatives considered

- Backend as separate workspace packages. Rejected by the Founder. Reasoning: a package boundary adds a build graph and an indirection layer for a single consumer, and the import rules above already enforce the separation.
- A separate API application. Rejected by the Founder. Reasoning: the platform is already the gateway ([ADR-0001](0001-bff-gateway.md)), so a second deployable would add another network hop and another service to run.
