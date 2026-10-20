---
title: "Software Design Patterns"
category: "engineering"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "design-patterns", "repository", "use-case", "gateway", "adapter", "factory", "redux"]
summary: "Catalog of core software design patterns used in sineva-platform: Repository, Use Case Interactor, Gateway/Adapter, Container Factory, and Redux Toolkit Slice patterns."
related_docs:
  - "../project-structure/clean_architecture_layers.md"
  - "coding_standards.md"
  - "response_pattern.md"
  - "state_management_redux.md"
---

# Software Design Patterns

`sineva-platform` applies proven Gang of Four (GoF) and Clean Architecture patterns to keep business logic decoupled from frameworks, databases, and external microservices.

---

## 1. Repository Pattern (`domain/repositories` → `infrastructure/database`)

**Intent**: Mediate between the domain and data mapping layers using a collection-like interface for accessing domain entities.

- **Contract (`src/domain/repositories/agent_repository.ts`)**:
  ```typescript
  export interface AgentFilterParams {
    page: number;
    per_page: number;
    department?: string;
    is_active?: boolean;
  }

  export interface IAgentRepository {
    findAll(params: AgentFilterParams): Promise<{ items: AgentEntity[]; total_items: number }>;
    findBySlug(agent_slug: string): Promise<AgentEntity | null>;
    create(agent: Omit<AgentEntity, 'agent_id' | 'created_at' | 'updated_at'>): Promise<AgentEntity>;
  }
  ```
- **Implementations**:
  - `DrizzleAgentRepository`: Production PostgreSQL implementation using Drizzle ORM.
  - `InMemoryAgentRepository`: Deterministic seeded repository for fast unit tests and zero-DB local previews.

---

## 2. Use Case / Interactor Pattern (`application/use-cases`)

**Intent**: Encapsulate a single application-specific user flow or system command with explicit input/output DTOs and constructor-injected dependencies.

```typescript
export class ChatWithAgentUseCase {
  constructor(
    private readonly agentRepository: IAgentRepository,
    private readonly aiEngineGateway: IAiEngineGateway,
  ) {}

  async execute(input: SendAgentChatDto): Promise<AgentChatResponseDto> {
    const agent = await this.agentRepository.findBySlug(input.agent_slug);
    if (!agent) {
      throw new EntityNotFoundError(`Agent '${input.agent_slug}' was not found`);
    }
    return this.aiEngineGateway.sendChatMessage({
      agent_slug: agent.agent_slug,
      prompt: input.prompt,
      conversation_id: input.conversation_id,
      context_metadata: input.context_metadata,
    });
  }
}
```

---

## 3. Gateway / Adapter Pattern (`domain/repositories` → `infrastructure/gateways`)

**Intent**: Wrap external services (`sineva-ai` internal FastAPI microservice, SeaweedFS S3 object storage, Redis) behind domain-specific interfaces so upstream protocol changes never leak into use cases.

### Example: `AiEngineHttpGateway`
- Translates domain chat requests into internal HTTP calls (`POST http://sineva-ai:8000/api/v1/agents/{agent_slug}/chat`).
- Automatically injects `X-Internal-Api-Key: <AI_ENGINE_INTERNAL_API_KEY>` and `X-Request-Id`.
- Implements graceful fallback if the internal container is unreachable during local frontend-only development.

---

## 4. Dependency Injection Factory Pattern (`infrastructure/container.ts`)

**Intent**: Centralize object graph construction without requiring heavy reflection/decorator frameworks that slow down Next.js serverless cold starts.

- `getPlatformContainer()` lazily initializes singleton instances of repositories, gateways, and use cases.
- Route Handlers call `const { listAgentsUseCase } = getPlatformContainer();` so handlers remain thin 15-line adapters.

---

## 5. Standardized Presenter / Envelope Pattern (`@sineva/shared`)

**Intent**: Ensure every HTTP response across all endpoints adheres to an identical JSON contract (`ApiResponse<T>`).
- Implemented via `createSuccessResponse`, `createPaginatedResponse`, and `createErrorResponse` in `packages/shared/src/response.ts`.
- Detailed in [Response Pattern Specification](./response_pattern.md).
