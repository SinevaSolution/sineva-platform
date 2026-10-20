---
title: "Sineva Platform — Unified Web Platform & BFF Monorepo"
description: "Production-grade Turborepo + Next.js 16 App Router monorepo powering the Sineva AI companion ecosystem."
category: "overview"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
---

# Sineva Platform (`sineva-platform`)

**Sineva Platform (`sineva-platform`)** is the unified web interface, Backend-for-Frontend (BFF), and API Gateway for the **Sineva AI** multi-agent ecosystem. Built as a **Turborepo** monorepo with **Next.js 16 (App Router, TypeScript)**, **React 19**, **Redux Toolkit**, **Tailwind CSS v4**, **Radix UI / shadcn**, **Swagger / OpenAPI 3.1**, **PostgreSQL 17 (Drizzle ORM)**, **Redis 7.4 (`ioredis`)**, and **SeaweedFS (S3)**, it provides a single, cohesive workspace for interacting with Sineva's specialized AI companions while communicating with `sineva-ai` strictly over an isolated internal Docker network.

---

## 1. System Architecture & Network Topology

```mermaid
flowchart LR
    User["Browser / Client"] -->|"HTTP/HTTPS :3000"| Web["sineva-platform (Next.js 16 BFF)"]
    subgraph sineva_internal["sineva_internal Docker Network (Isolated)"]
        Web -->|"Internal HTTP + X-Internal-Api-Key (http://sineva-ai:8000)"| AI["sineva-ai (FastAPI + Agno + MCP)"]
        Web -->|"Drizzle ORM :5432"| PG[("PostgreSQL 17 (sineva_db)")]
        Web -->|"ioredis :6379"| Redis[("Redis 7.4")]
        Web -->|"AWS S3 SDK :8333"| S3[("SeaweedFS S3")]
        AI -->|"SQLAlchemy Async"| PG
        AI -->|"Session & State Cache"| Redis
        AI -->|"S3 Artifact Access"| S3
        AI -->|"Vector Search :6333"| Qdrant[("Qdrant Vector DB")]
    end
```

### Key Architectural Pillars
- **Clean Architecture Inside Next.js (`apps/web/src/`)**: Strict separation between `domain/` (entities, repository interfaces, domain errors), `application/` (use cases & `snake_case` Zod DTOs), `infrastructure/` (Drizzle Postgres, Redis, SeaweedFS S3, Internal AI Engine Gateway, OpenAPI 3.1 spec), and `presentation/` (Redux Toolkit slices, `snake_case` HTTP response helper, AI-Native React 19 UI).
- **Internal-Only AI Engine Communication**: `sineva-platform` is the only publicly exposed web interface (`:3000`). It proxies and orchestrates requests to `sineva-ai` over the internal `sineva_internal` Docker bridge (`http://sineva-ai:8000/api/v1`) authenticated via `X-Internal-Api-Key`. `sineva-ai` exposes **zero** host ports.
- **Strict `snake_case` Contract & Standardized Response Utility**: Every API request payload, query parameter, response envelope (`success`, `status`, `message`, `data`, `meta`, `errors`), and PostgreSQL table/column name uses `snake_case`.
- **Best-in-Class Frontend & UX Styling**:
  - **3-Layer Design Token System**: Primitive (`--teal-50`..`--teal-900`, `--ink-50`..`--ink-950`, `--aqua-400`, `--sun-100`) $\rightarrow$ Semantic (`--color-canvas`, `--color-surface`, `--color-text`, `--color-action-primary`) $\rightarrow$ Component tokens, with full Light & Dark mode (`next-themes`).
  - **UI & Micro-interaction Stack**: Radix UI primitives (`@radix-ui/react-dialog`, `dropdown-menu`, `tabs`, `tooltip`, `switch`, `avatar`, `slot`), `class-variance-authority` (CVA), `tailwind-merge` + `clsx`, `lucide-react` icons, `motion` + `gsap` exponential easing, `cmdk` (`⌘K` Command Palette), and `sonner` toast notifications.

---

## 2. Specialized AI Companions

| Companion Slug | Handle | Domain | Primary Focus |
| :--- | :--- | :--- | :--- |
| `sino_people` | `@SinoPeople` | People & HR | Talent acquisition, onboarding workflows, and HR policy intelligence |
| `sino_finance` | `@SinoFinance` | Finance & FP&A | Cashflow forecasting, burn analysis, and ledger reconciliation |
| `sino_sales` | `@SinoSales` | Revenue & Sales | Pipeline scoring, MEDDPICC qualification, and outbound deal strategy |
| `sino_social` | `@SinoSocial` | Brand & Social | Omnichannel campaign planning, copywriting, and audience analytics |
| `sino_help` | `@SinoHelp` | Support & SLA | Tier-2 technical triage, root-cause diagnostics, and ticket routing |
| `sino_insights` | `@SinoInsights` | Executive BI | Cross-functional KPI synthesis, cohort telemetry, and predictive insights |

---

## 3. Repository & Monorepo Structure

```text
sineva-platform/
├── apps/
│   └── web/                        # @sineva/web — Next.js 16 App Router + Clean Architecture BFF
│       └── src/
│           ├── domain/             # Entities, repository contracts, domain errors
│           ├── application/        # Use cases & snake_case Zod DTOs
│           ├── infrastructure/     # Drizzle Postgres, Redis, SeaweedFS S3, AI Engine Gateway, OpenAPI
│           ├── presentation/       # Redux store/slices, HTTP response helper, UI components
│           └── app/                # Next.js App Router pages, /api-docs Swagger UI, /api/v1/* routes
├── packages/
│   ├── shared/                     # @sineva/shared — Canonical snake_case Response Utility & types
│   └── ui/                         # @sineva/ui — Shared token-driven UI primitives (Button, Card, Badge, etc.)
├── docs/                           # Multi-folder YAML-frontmatter documentation suite (see docs/README.md)
├── .github/workflows/ci.yml        # GitHub Actions CI pipeline (lint, typecheck, test, build)
├── docker-compose.yml              # Full shared stack (Postgres, Redis, SeaweedFS S3, Qdrant, sineva-ai, web)
├── Dockerfile                      # Multi-stage Node 24 Alpine production image
├── AGENTS.md                       # Engineering & architectural rules for AI coding agents
└── CLAUDE.md                       # Reference pointer to @AGENTS.md
```

---

## 4. Prerequisites

- **Node.js**: `v24.21.0` (specified in `.nvmrc`, `>=24.15.0 <25`)
- **npm**: `v11+`
- **Docker & Docker Compose**: v2+ (for running PostgreSQL, Redis, SeaweedFS S3, Qdrant, and internal `sineva-ai`)

---

## 5. Installation & Local Development Setup

### Step 1: Clone Repositories (Sibling Directory Layout)
For the full Docker Compose stack to build both `sineva-platform` and `sineva-ai` together, clone both repositories side by side in the same parent directory:

```bash
git clone https://github.com/SinevaSolution/sineva-platform.git
git clone https://github.com/SinevaSolution/sineva-ai.git
cd sineva-platform
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env` and adjust any credentials if needed:

```bash
cp .env.example .env
```

Key environment variables in `.env`:
- `DATABASE_URL=postgresql://sineva_user:sineva_password@localhost:5432/sineva_db`
- `REDIS_URL=redis://localhost:6379/0`
- `S3_ENDPOINT=http://localhost:8333`
- `S3_BUCKET_NAME=sineva-assets`
- `AI_ENGINE_INTERNAL_URL=http://sineva-ai:8000`
- `AI_ENGINE_INTERNAL_API_KEY=sineva_internal_secret_key_change_in_prod`

---

## 6. How to Run

### Option A: Run Local Development Server (Standalone / Fast UI & BFF Iteration)
`sineva-platform` includes graceful fallback adapters so you can develop and test the UI, Redux store, and BFF API routes even before starting the Docker infrastructure:

```bash
npm run dev
```

- **Web Platform & Companion Workspace**: [http://localhost:3000](http://localhost:3000)
- **Interactive Swagger UI (OpenAPI 3.1)**: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
- **Raw OpenAPI 3.1 JSON Spec**: [http://localhost:3000/api/openapi.json](http://localhost:3000/api/openapi.json)
- **System Health Endpoint**: [http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health)

### Option B: Run the Full Containerized Stack (Docker Compose)
Bring up PostgreSQL 17, Redis 7.4, SeaweedFS (Master, Volume, Filer, S3 Gateway), Qdrant, internal `sineva-ai` (port `8000` internal-only), and `sineva-platform` (port `3000`):

```bash
npm run docker:up
# or directly:
docker compose up -d --build
```

To stop the stack:
```bash
npm run docker:down
```

---

## 7. Quality Gates (Lint, Typecheck, Test, Build)

```bash
# Run ESLint across all Turborepo packages
npm run lint

# Run Next.js typegen + TypeScript strict compiler check
npm run typecheck

# Run Vitest unit & integration test suites
npm run test

# Build production bundles via Turborepo
npm run build
```

---

## 8. Documentation (`docs/`)

Start at [`docs/README.md`](docs/README.md) for the complete index of agent-ready markdown documentation:
- **[`docs/project-structure/`](docs/project-structure/)**: Monorepo overview, Turborepo workspaces, Clean Architecture layers
- **[`docs/engineering/`](docs/engineering/)**: Coding standards, design patterns, `snake_case` response pattern, database conventions, Redux state management, testing & CI
- **[`docs/design-context/`](docs/design-context/)**: AI-Native design system, 3-layer design tokens, UX & frontend libraries, brand copywriting
- **[`docs/api-spec/`](docs/api-spec/)**: API overview, Swagger/OpenAPI guide, agents & chat endpoints, storage & health endpoints
- **[`docs/troubleshooting/`](docs/troubleshooting/)**: Common issues, Docker & internal network debugging, storage/DB/Redis runbooks
- **[`docs/development/`](docs/development/)**: Product roadmap, vertical-slice feature workflow, future features template
- **[`docs/deployment/`](docs/deployment/)**: Docker Compose topology, internal network security, CI/CD pipeline
- **[`docs/research/`](docs/research/)**: BFF gateway pattern, SeaweedFS S3 architecture, agentic UX interfaces
