---
title: "Coding Standards & Naming Conventions"
category: "engineering"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "coding-standards", "typescript", "snake-case", "eslint", "prettier"]
summary: "Strict TypeScript coding standards, snake_case data/API enforcement, naming conventions, and linting/formatting rules for sineva-platform."
related_docs:
  - "design_pattern.md"
  - "response_pattern.md"
  - "database_conventions.md"
---

# Coding Standards & Naming Conventions

All code in `sineva-platform` must adhere to strict TypeScript compile-time guarantees, deterministic naming conventions, and zero ESLint warnings.

---

## 1. TypeScript Strictness Rules

Every `tsconfig.json` across `apps/*` and `packages/*` enables full strictness:
- `"strict": true`
- `"noImplicitAny": true`
- `"strictNullChecks": true`
- `"noUncheckedIndexedAccess": true` (where applicable)
- **Zero `any` Policy**: Never use `any`. Use explicit interfaces, generic type parameters (`<T>`), or `unknown` narrowed via type guards.
- **Explicit Return Types**: All exported functions, use cases, repository methods, and Route Handlers must declare explicit return types.

---

## 2. The Golden Rule: End-to-End `snake_case` for Data & Payloads

To guarantee 1:1 schema compatibility between `sineva-platform` (TypeScript/Next.js), PostgreSQL (`sineva_platform`), and `sineva-ai` (Python/FastAPI/Pydantic), **all data keys must use `snake_case`**.

| Scope | Naming Convention | Example |
| :--- | :--- | :--- |
| **PostgreSQL Tables & Columns** | `snake_case` | `ai_agents`, `agent_slug`, `created_at`, `max_tokens` |
| **Domain Entity Properties** | `snake_case` | `agent_id`, `display_name`, `specialty_domain`, `is_active` |
| **DTOs & API Request/Response Keys** | `snake_case` | `request_id`, `total_items`, `per_page`, `has_next`, `conversation_id` |
| **Redux State Slice Keys** | `snake_case` | `active_agent_slug`, `selected_department`, `is_command_palette_open` |
| **Utility / Domain Filenames** | `snake_case.ts` | `snake_case.ts`, `agent_repository.ts`, `ai_engine_http_gateway.ts` |
| **React Component Filenames** | `PascalCase.tsx` or `snake_case.tsx` | `AgentCompanionCard.tsx` |
| **TypeScript Classes, Interfaces, Types** | `PascalCase` | `AgentEntity`, `ListAgentsUseCase`, `ApiResponse<T>` |
| **Functions, Methods, Local Variables** | `camelCase` | `createSuccessResponse()`, `generateRequestId()`, `safePerPage` |
| **Constants & Environment Variables** | `UPPER_SNAKE_CASE` | `AI_ENGINE_INTERNAL_URL`, `DEFAULT_PAGE_SIZE` |

### Runtime & Compile-Time `snake_case` Validation
Use the helpers exported from `@sineva/shared` (`packages/shared/src/snake_case.ts`) whenever validating untrusted input or asserting payload conformance:
- `isSnakeCaseKey(key: string): boolean`
- `toSnakeCaseKey(key: string): string`
- `toSnakeCaseObject<T>(input: T): unknown`
- `assertSnakeCaseKeys(obj: unknown, path?: string): void`

---

## 3. Formatting & Linting Standards

### Prettier Configuration (`.prettierrc.json`)
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

### ESLint Enforcement (`apps/web/eslint.config.mjs`)
- Next.js Core Web Vitals and TypeScript ESLint rules are enforced.
- Unused variables are forbidden unless prefixed with `_` (e.g., `_req`).
- Run `npm run lint` and `npm run typecheck` before every commit. Both are blocking quality gates in GitHub Actions CI.
