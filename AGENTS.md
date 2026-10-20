---
title: "AGENTS.md — Sineva Platform Engineering Guidelines"
description: "Mandatory architectural, naming, styling, and testing instructions for AI coding agents working in sineva-platform."
category: "governance"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
---

# AGENTS.md — Sineva Platform (`sineva-platform`)

Before writing any code, API routes, database schemas, or UI components, read [`docs/README.md`](docs/README.md) and navigate to the relevant category inside [`docs/`](docs/).

## 1. Purpose & Role in the Sineva Ecosystem

`sineva-platform` is the **Unified Web Platform & BFF (Backend-for-Frontend) Interface** of the Sineva AI ecosystem:
- Built as a **Turborepo** monorepo (`apps/web`, `packages/shared`, `packages/ui`) with **Next.js 16 (App Router)**, **React 19**, **TypeScript 5 (Strict)**, and **Redux Toolkit**.
- Acts as the sole public gateway (`/api/v1/*`) and communicates with `sineva-ai` (Python FastAPI AI Engine) **exclusively over the internal Docker bridge network** (`http://sineva-ai:8000/api/v1` on `sineva_internal` with `X-Internal-Api-Key`). `sineva-ai` never exposes public ports to the host.
- Shares core stateful infrastructure with `sineva-ai`: **PostgreSQL 17** (`sineva_db` via Drizzle ORM), **Redis 7.4** (via `ioredis`), and **SeaweedFS S3** (via `@aws-sdk/client-s3`).

## 2. Clean Architecture Layering (`apps/web/src/`)

Every feature in `apps/web/src/` must respect strict inward-pointing dependencies (see [`docs/project-structure/clean_architecture_layers.md`](docs/project-structure/clean_architecture_layers.md)):

1. **`domain/`**: Enterprise business entities (`agent.ts`, `workspace.ts`, `chat_session.ts`, `user.ts`), domain errors (`domain_error.ts`), and pure repository/gateway interfaces (`agent_repository.ts`, `ai_engine_gateway.ts`, `cache_repository.ts`, `storage_repository.ts`). Zero framework or ORM imports.
2. **`application/`**: Use-case orchestrators (`get_agents_use_case.ts`, `send_agent_message_use_case.ts`, `presign_storage_upload_use_case.ts`, `get_system_health_use_case.ts`) and Zod DTO schemas (`agent_dto.ts`, `chat_dto.ts`, `pagination_dto.ts`). Depends only on `domain/`.
3. **`infrastructure/`**: Concrete adapters for PostgreSQL + Drizzle (`database/`), Redis (`cache/`), SeaweedFS S3 (`storage/`), Internal AI Engine HTTP Gateway (`gateways/`), and OpenAPI 3.1 specifications (`openapi/`).
4. **`presentation/`**: Redux Toolkit slices (`store/`), HTTP response helpers (`http/`), and React 19 UI components (`components/`).
5. **`app/`**: Next.js 16 App Router pages and REST API Route Handlers (`app/api/v1/...`, `app/api/openapi.json/route.ts`, `app/api-docs/page.tsx`).

## 3. Mandatory `snake_case` Contract & Response Utility

- **All JSON keys** in request bodies, query parameters (`page`, `per_page`, `category_filter`), database tables/columns (`workspaces`, `users`, `agent_configs`, `chat_sessions`, `chat_messages`, `storage_objects`), Redux state payloads, and responses MUST use **`snake_case`**. See [`docs/engineering/database_conventions.md`](docs/engineering/database_conventions.md) and [`docs/engineering/response_pattern.md`](docs/engineering/response_pattern.md).
- **All API responses** MUST use `@sineva/shared` (`createSuccessResponse`, `createPaginatedResponse`, `createErrorResponse`) wrapped by `presentation/http/response_helper.ts`:
  ```json
  {
    "success": true,
    "status": 200,
    "message": "Operation completed successfully",
    "data": {},
    "meta": {
      "page": 1,
      "per_page": 10,
      "total_items": 6,
      "total_pages": 1,
      "has_next": false,
      "has_prev": false,
      "request_id": "req_...",
      "timestamp": "2026-10-21T00:00:00.000Z"
    },
    "errors": null
  }
  ```

## 4. Design System, Frontend Libraries & Accessibility Rules

Read [`docs/design-context/design_system.md`](docs/design-context/design_system.md), [`docs/design-context/design_tokens.md`](docs/design-context/design_tokens.md), and [`docs/design-context/ux_and_frontend_libraries.md`](docs/design-context/ux_and_frontend_libraries.md):
- **Three-Layer Token Architecture**: Never hardcode raw hex values in components. Reference semantic CSS variables (`--color-canvas`, `--color-surface`, `--color-surface-elevated`, `--color-text`, `--color-text-muted`, `--color-action-primary`, `--color-border`) defined in `apps/web/src/app/globals.css`.
- **UI & UX Stack**: Use Radix UI / shadcn primitives (`@radix-ui/react-*`), `class-variance-authority` (CVA), `clsx` + `tailwind-merge` (`cn`), `lucide-react` icons, `motion` + `gsap` for exponential-eased transitions, `cmdk` for the `⌘K` Command Palette, `sonner` for toasts, and `next-themes` for Light/Dark mode.
- **WCAG 2.2 AA**: Maintain `>= 44x44px` interactive hit targets, keyboard navigation (`⌘K` Command Palette), and `prefers-reduced-motion` support.

## 5. Documentation Map (`docs/`)

All engineering, design, API, deployment, and research documentation uses standardized YAML frontmatter and is indexed in [`docs/README.md`](docs/README.md):
- [`docs/project-structure/`](docs/project-structure/) — Monorepo layout, Turborepo workspaces, Clean Architecture layers
- [`docs/engineering/`](docs/engineering/) — Coding standards, design patterns, `snake_case` response utility, Redux state, database conventions, testing & CI
- [`docs/design-context/`](docs/design-context/) — Design system, 3-layer design tokens, UX/frontend libraries, copywriting & brand
- [`docs/api-spec/`](docs/api-spec/) — REST conventions, Swagger/OpenAPI 3.1, agents/chat/storage/health endpoints
- [`docs/troubleshooting/`](docs/troubleshooting/) — Common issues, Docker internal network, Postgres/Redis/SeaweedFS debugging
- [`docs/development/`](docs/development/) — Roadmap, vertical-slice feature workflow, future features RFC template
- [`docs/deployment/`](docs/deployment/) — Docker Compose topology, zero-port internal AI Engine security, CI/CD pipeline
- [`docs/research/`](docs/research/) — BFF gateway architecture, SeaweedFS S3 architecture, agentic UX patterns

## 6. Verification Commands

Before completing any task or opening a PR, run all checks from the repository root:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
