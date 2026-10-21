---
title: "Design Patterns"
category: "engineering"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "design-patterns", "ports-and-adapters", "use-case", "container", "zod", "contract-guard"]
summary: "The patterns the backend actually uses, with the real class and function names: ports and adapters, use cases, container getters, Zod at the edges, contract-guard types, and error translation."
related_docs:
  - "../project-structure/clean_architecture_layers.md"
  - "error_handling_and_failure_modes.md"
  - "response_pattern.md"
  - "state_management_redux.md"
  - "coding_standards.md"
---

# Design Patterns

Only patterns present in `apps/web/src/server` are listed, under the names the code uses. Layer rules are in [clean architecture layers](../project-structure/clean_architecture_layers.md). "Debt" marks things not to copy.

## 1. Ports and adapters

A port is a TypeScript interface in `server/domain/repositories/`. An adapter is a class in `server/infrastructure/` that implements it. Port names describe the role and carry no `I` prefix. Files are named after the port.

| Port | File | Adapter | Fake for tests |
| :--- | :--- | :--- | :--- |
| `AgentRepository` | `agent_repository.ts` | `PrismaAgentRepository` (`infrastructure/database`) | `FakeAgentRepository` |
| `AiEngineGateway` | `ai_engine_gateway.ts` | `InternalAiEngineGateway` (`infrastructure/gateways`) | `FakeAiEngineGateway` |
| `CacheRepository` | `cache_repository.ts` | `RedisCacheRepository` (in-memory today) | `FakeCache` |
| `StorageRepository` | `storage_repository.ts` | `SeaweedStorageRepository` (`infrastructure/storage`) | `FakeStorage` |

Fakes live in `src/__tests__/fakes/`. `AgentRepository` exposes `findAll`, `findBySlug` and `create`. `AiEngineGateway` exposes `dispatchAgentChat` and `checkHealth`, and its doc comment states which domain errors it throws. A port is the contract for failures as well as for data.

Rules of thumb:

- Domain types in, domain types out. The adapter maps rows or HTTP bodies to entities (`toEntity` in `prisma_agent_repository.ts`). Generated Prisma types never cross the port.
- An adapter converts driver failures into `DomainError` subclasses (section 5).
- One adapter per technology, wired in exactly one place (section 3).

## 2. Use cases

One class per application intent, in `server/application/use-cases/`, named `<Verb><Noun>UseCase`. Dependencies are ports, injected through the constructor as `private readonly` fields. The entry point is `execute`.

```typescript
export class SendAgentMessageUseCase {
  constructor(
    private readonly agentRepository: AgentRepository,
    private readonly aiEngineGateway: AiEngineGateway,
  ) {}

  async execute(request: AiEngineChatRequest): Promise<AiEngineChatResponse> {
    const agent = await this.agentRepository.findBySlug(request.agent_slug);
    if (!agent) {
      throw new NotFoundError('Agent', request.agent_slug);
    }
    return this.aiEngineGateway.dispatchAgentChat(request);
  }
}
```

Existing use cases: `GetAgentsUseCase`, `SendAgentMessageUseCase`, `PresignStorageUploadUseCase`, `GetSystemHealthUseCase`. A use case never imports `next`, `react`, Prisma, `fetch` wrappers or `http`.

Debt: `GetAgentsUseCase` also has `registerAgent` (a write), builds its own cache keys, and on register deletes only the page-1 key, so other cached pages go stale for up to the 30 second TTL.

## 3. Container getters

`server/container.ts` is the composition root: lazy, memoized getters, one per use case. The private `memoize(factory)` helper builds an instance on first call. Nothing is constructed at import time, because `next build` imports every route module.

```typescript
export const getSendAgentMessageUseCase = memoize(
  () => new SendAgentMessageUseCase(getAgentRepository(), getAiEngineGateway()),
);
```

A route handler calls `getSendAgentMessageUseCase().execute(...)`. Tests do not use the real container: `api_routes.test.ts` replaces `@/server/container` with `vi.mock` and returns use cases built on fakes. Full rules and gotchas: [clean architecture layers, section 4](../project-structure/clean_architecture_layers.md#4-the-container).

## 4. Zod at the edge

Untrusted data is parsed once, where it enters:

- Inbound HTTP. DTO schemas live in `server/application/dtos/` (`sendAgentChatDtoSchema`, `presignStorageDtoSchema`, `createAgentDtoSchema`, `listAgentsQuerySchema`, `paginationQuerySchema`). Route handlers read the body as `unknown` and call `.parse`. Types come from `z.infer` (`SendAgentChatDto` and so on). Query strings use `z.coerce` for numbers.
- Upstream HTTP. `InternalAiEngineGateway` validates sineva-ai's `{ success: true, data }` envelope with `chatEnvelopeSchema`. The schema is deliberately not `.strict()`: unknown fields are dropped so sineva-ai can add fields, while a missing or mistyped field fails and raises `UpstreamServiceError`.
- Database rows. Columns are free-form text and JSON, so `prisma_agent_repository.ts` checks values (`toCategory`, `toStatus`, `toCapabilities`) and throws on unknown ones instead of casting.

A `ZodError` becomes a 422 in `handleRouteError`.

## 5. Translating failures

Adapters catch what they understand and convert it to a domain error. Everything else is rethrown.

- `isUniqueViolation` (Prisma code `P2002`) to `ConflictError`. It relies on the unique index instead of a find-then-insert check, which would race.
- Network error, timeout, abort to `UpstreamUnavailableError`. Non-2xx, non-JSON or invalid body to `UpstreamServiceError`.

The table of errors and statuses is in [error handling and failure modes](error_handling_and_failure_modes.md).

## 6. Contract-guard types

`AssertAssignable<Sub extends Super, Super>` in `server/http/agent_view_contract.ts` and `chat_view_contract.ts` fails `tsc` when a server type stops fitting the browser view in `src/shared`. It is a compile-time check with no runtime cost. Use the same shape for any new browser-facing payload.

A related trick, in `prisma_agent_repository.ts`: `Record<AgentCategory, true>` and `Record<AgentStatus, true>` make adding a member to a domain union fail to compile until the adapter handles it, instead of rejecting valid rows at runtime.

## 7. Response envelope

`sendSuccessJson`, `sendPaginatedJson` and `handleRouteError` in `server/http/response_helper.ts` wrap `createSuccessResponse`, `createPaginatedResponse` and `createErrorResponse` from `@sineva/shared`. See [response pattern](response_pattern.md).

## 8. Lazy process-wide singleton

`getPrismaClient` (`infrastructure/database/prisma_client.ts`) builds the client on first call. In development it stores the instance on `globalThis` (`__sineva_prisma`), because hot reload re-evaluates modules and a module-level variable would leak one connection pool per reload. In production a module-level variable is enough.

## 9. Client state

Redux Toolkit slices and a `makeStore()` factory: see [state management](state_management_redux.md).

## 10. Not in the code

There is no DI framework, no decorators, no event bus, no CQRS split and no domain events. Do not describe the code with those terms, and do not add one without a decision record.
