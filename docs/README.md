---
title: "Sineva Platform Documentation Index"
category: "root"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "platform", "documentation", "index", "architecture", "turborepo"]
summary: "Master documentation index for the Sineva Platform (Next.js BFF, Turborepo monorepo, Clean Architecture, UI Design System, and API Specifications)."
related_docs:
  - "project-structure/overview.md"
  - "engineering/coding_standards.md"
  - "design-context/design_system.md"
  - "api-spec/overview.md"
---

# Sineva Platform Documentation (`sineva-platform`)

Welcome to the official engineering, architecture, and design documentation for **`sineva-platform`**. Every document in this repository begins with structured YAML frontmatter so both human engineers and autonomous AI coding agents can rapidly index, traverse, and enforce platform invariants.

---

## System Snapshot

| Attribute | Specification |
| :--- | :--- |
| **Monorepo Orchestrator** | Turborepo (`apps/web`, `packages/shared`, `packages/ui`) |
| **Primary Framework** | Next.js 15+ (App Router, React 19, TypeScript 5.8+ Strict Mode) |
| **Architectural Pattern** | Clean Architecture (`domain` → `application` → `infrastructure` → `presentation`) + BFF Gateway |
| **Data & Serialization Contract** | Strict `snake_case` across PostgreSQL (Drizzle ORM), Redis, REST JSON payloads, and Redux Toolkit slices |
| **Shared Infrastructure** | PostgreSQL 17, Redis 7.4, SeaweedFS S3 (`:8333`), and internal bridge (`sineva_internal`) to `sineva-ai:8000` |

---

## Complete Documentation Directory

### 1. Project Structure (`docs/project-structure/`)
Architectural topology, workspace boundaries, and Clean Architecture dependency rules.
- [Architecture & Topology Overview](./project-structure/overview.md) — End-to-end BFF-to-AI Engine topology, shared data stores, and monorepo layout.
- [Turborepo Workspaces & Build Pipeline](./project-structure/turborepo_workspaces.md) — Boundaries and build graph for `apps/web`, `@sineva/shared`, and `@sineva/ui`.
- [Clean Architecture Layers](./project-structure/clean_architecture_layers.md) — Strict inward dependency rules across `domain`, `application`, `infrastructure`, and `presentation`.

### 2. Engineering Standards (`docs/engineering/`)
Core coding conventions, design patterns, standardized response envelopes, database rules, and testing pipelines.
- [Coding Standards & Naming Conventions](./engineering/coding_standards.md) — TypeScript strict mode, `snake_case` data/API enforcement, ESLint, and Prettier rules.
- [Software Design Patterns](./engineering/design_pattern.md) — Repository, Use Case, Gateway/Adapter, Factory, and Redux Toolkit slice patterns.
- [Standardized API Response Pattern](./engineering/response_pattern.md) — Specification of `@sineva/shared` (`ApiResponse<T>`, `ResponseMeta`, `PaginationMeta`, `ErrorDetail`).
- [Database & Drizzle ORM Conventions](./engineering/database_conventions.md) — PostgreSQL 17 + Drizzle ORM schema rules, `snake_case` columns, indexing, and migrations.
- [State Management with Redux Toolkit](./engineering/state_management_redux.md) — Typed Redux store architecture, async thunks, and `snake_case` client state slices.
- [Testing Strategy & CI Pipeline](./engineering/testing_and_ci.md) — TDD workflow with Vitest, unit vs. integration testing boundaries, and GitHub Actions automation.

### 3. Design Context & UI System (`docs/design-context/`)
AI-Native visual hierarchy, three-layer CSS token architecture, accessible primitives, and brand voice.
- [AI-Native Design System Philosophy](./design-context/design_system.md) — Visual hierarchy, progressive disclosure, optimistic UI, and WCAG AA accessibility.
- [Design Tokens & Typography Scale](./design-context/design_tokens.md) — Primitive (`--teal-*`, `--ink-*`, `--aqua-400`, `--sun-100`), Semantic, and Component tokens with Plus Jakarta Sans & Geist Mono.
- [UX Patterns & Frontend Libraries](./design-context/ux_and_frontend_libraries.md) — Radix UI / shadcn primitives, CVA, Tailwind CSS v4, Motion/GSAP exponential easing, `cmdk` (`⌘K`), and `sonner`.
- [Copywriting & Brand Voice](./design-context/copywriting_and_brand.md) — Sineva brand personality, companion naming (`@SinoPeople`, `@SinoFinance`, `@SinoSales`, `@SinoSocial`, `@SinoHelp`, `@SinoInsights`), and microcopy guidelines.

### 4. API Specification (`docs/api-spec/`)
Public RESTful BFF endpoints, OpenAPI 3.1 auto-generation, and request/response payload contracts.
- [REST API Overview & Contracts](./api-spec/overview.md) — Versioning (`/api/v1`), `snake_case` enforcement, authentication headers, and error codes.
- [Swagger UI & OpenAPI Specification](./api-spec/swagger_and_openapi.md) — How `/api/openapi.json` and `/api-docs` work and how to register new route schemas.
- [Agents & Chat Endpoints](./api-spec/agents_and_chat_endpoints.md) — Specifications for `GET /api/v1/agents`, `POST /api/v1/agents`, and `POST /api/v1/agents/{agent_slug}/chat`.
- [Storage & Health Endpoints](./api-spec/storage_and_health_endpoints.md) — Specifications for `GET /api/v1/health` and `POST /api/v1/storage/presign` (SeaweedFS S3).

### 5. Troubleshooting (`docs/troubleshooting/`)
Diagnostic runbooks for local development, Docker bridge networking, and storage/database services.
- [Common Build & Development Issues](./troubleshooting/common_issues.md) — Fixing Turborepo build cache, TypeScript path aliases, and ESLint/Vitest issues.
- [Docker & Internal Network Debugging](./troubleshooting/docker_and_internal_network.md) — Diagnosing `sineva_internal` bridge traffic between `sineva-platform` and `sineva-ai`.
- [Storage, PostgreSQL & Redis Troubleshooting](./troubleshooting/storage_db_and_redis.md) — Resolving Drizzle connection issues, Redis key eviction, and SeaweedFS S3 presigned URL signatures.

### 6. Development Workflows (`docs/development/`)
Roadmaps, vertical-slice implementation guides, and RFC templates for human and AI engineers.
- [Platform Roadmap & Milestones](./development/roadmap.md) — Phased delivery milestones for the Sineva Platform.
- [Feature Development Workflow](./development/feature_development_workflow.md) — Step-by-step guide to building a feature from Domain entities to Next.js UI and API routes.
- [Future Features PRD/RFC Template](./development/future_features_template.md) — Standardized template with YAML frontmatter for proposing new platform capabilities.

### 7. Deployment & Infrastructure (`docs/deployment/`)
Container orchestration, zero-trust internal networking, and production CI/CD pipelines.
- [Docker Compose Topology](./deployment/docker_compose_topology.md) — Complete orchestration of Postgres, Redis, SeaweedFS (Master/Volume/Filer/S3), Qdrant, `sineva-ai`, and `sineva-platform`.
- [Internal Network Security](./deployment/internal_network_security.md) — Zero host-port exposure for `sineva-ai`, `X-Internal-Api-Key` verification, and network isolation.
- [CI/CD Pipeline & Rollout Checklist](./deployment/ci_cd_pipeline.md) — GitHub Actions quality gates, multi-stage Docker builds, and zero-downtime deployment steps.

### 8. Architectural Research (`docs/research/`)
Architecture Decision Records (ADRs) and deep-dive evaluations behind core platform choices.
- [BFF Gateway Pattern over Isolated AI Engine](./research/bff_gateway_pattern.md) — Architectural rationale for making Next.js the sole public gateway over an internal FastAPI AI Engine.
- [SeaweedFS S3 Architecture for Multi-Agent Artifacts](./research/seaweedfs_s3_architecture.md) — Performance evaluation and configuration of SeaweedFS S3 (`:8333`) for high-throughput agent files.
- [Agentic UX & Streaming Interfaces](./research/ux_agentic_interfaces.md) — Research on command palettes (`⌘K`), multi-agent delegation timelines, and optimistic UI.
