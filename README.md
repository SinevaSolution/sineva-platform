---
title: "Sineva Platform: Unified Web Platform and BFF Monorepo"
description: "Turborepo and Next.js 16 App Router monorepo that serves the Sineva web app and the BFF in front of sineva-ai."
category: "overview"
status: "active"
version: "1.1.0"
last_updated: "2026-10-21"
---

# Sineva Platform (`sineva-platform`)

**Sineva Platform (`sineva-platform`)** is the unified web interface, Backend-for-Frontend (BFF), and API Gateway for the **Sineva AI** multi-agent ecosystem. Built as a **Turborepo** monorepo with **Next.js 16 (App Router, TypeScript)**, **React 19**, **Redux Toolkit**, **Tailwind CSS v4**, **Radix UI / shadcn**, **OpenAPI 3.1**, **PostgreSQL 17 (Prisma 7.10.1)**, **Redis 7.4 (`ioredis`)**, and **SeaweedFS (S3)**, it provides a single, cohesive workspace for interacting with Sineva's specialized AI companions while communicating with `sineva-ai` strictly over an isolated internal Docker network.

---

## 1. System Architecture & Network Topology

```mermaid
flowchart LR
    User["Browser / Client"] -->|"HTTP/HTTPS :3000"| Web["sineva-platform (Next.js 16 BFF)"]
    subgraph sineva_internal["sineva_internal Docker network"]
        Web -->|"Internal HTTP + X-Internal-Api-Key (http://sineva-ai:8000)"| AI["sineva-ai (FastAPI + Agno + MCP)"]
        Web -->|"Prisma :5432 (schema platform)"| PG[("PostgreSQL 17 (sineva_platform)")]
        Web -->|"ioredis :6379"| Redis[("Redis 7.4")]
        Web -->|"AWS S3 SDK :8333"| S3[("SeaweedFS S3")]
        AI -->|"SQLAlchemy Async (schema sineva_ai)"| PG
        AI -->|"Session & State Cache"| Redis
        AI -->|"S3 Artifact Access"| S3
        AI -->|"Vector Search :6333"| Qdrant[("Qdrant Vector DB")]
    end
```

### Key Architectural Pillars
- **Backend and Frontend Split Inside Next.js (`apps/web/src/`)**: `app/` is the routing edge (thin route handlers). `server/` is the backend, with `domain/` (entities, repository interfaces, domain errors), `application/` (use cases and `snake_case` Zod DTOs), `infrastructure/` (Prisma Postgres, Redis, SeaweedFS S3, Internal AI Engine Gateway, OpenAPI 3.1 spec), `http/` (`snake_case` response helper) and `container.ts` (the only place adapters are constructed). `client/` is the frontend (React 19 components, Redux Toolkit store) and may not import `server/`. `shared/` holds wire types both sides may import. Rules and enforcement: [ADR-0004](docs/decisions/0004-web-app-structure-and-dependency-rules.md).
- **Internal-Only AI Engine Communication**: `sineva-platform` is the only publicly exposed web interface (`:3000`). It proxies and orchestrates requests to `sineva-ai` over the internal `sineva_internal` Docker bridge (`http://sineva-ai:8000/api/v1`) authenticated via `X-Internal-Api-Key`. `sineva-ai` exposes **zero** host ports. It is not the only unpublished service: `seaweedfs-volume` has none either, while the same compose file publishes Postgres (5432), Redis (6379, no password), Qdrant (6333) and the SeaweedFS master, filer and S3 ports (9333, 8888, 8333) to the host. That suits local development; on a server, bind them to `127.0.0.1` or remove them.
- **Strict `snake_case` Contract & Standardized Response Utility**: Every API request payload, query parameter, response envelope (`success`, `status`, `message`, `data`, `meta`, `errors`), and PostgreSQL table/column name uses `snake_case`. Every table has a UUID primary key `id` ([ADR-0014](docs/decisions/0014-uuid-primary-keys.md)).
- **`sineva-ai` Owns the Chat Contract**: the internal chat request and reply are defined in `sineva-ai`, and the platform gateway adapts to them ([ADR-0015](docs/decisions/0015-sineva-ai-owns-internal-chat-contract.md)). When `sineva-ai` answers badly the platform returns `502`, and when it cannot be reached it returns `503`. There is no fallback reply ([ADR-0016](docs/decisions/0016-upstream-failures-return-502-503.md)).
- **Best-in-Class Frontend & UX Styling**:
  - **3-Layer Design Token System**: Primitive (`--teal-50`..`--teal-900`, `--ink-50`..`--ink-950`, `--aqua-400`, `--sun-100`) $\rightarrow$ Semantic (`--color-canvas`, `--color-surface`, `--color-text`, `--color-action-primary`) $\rightarrow$ Component tokens, with full Light & Dark mode (`next-themes`).
  - **UI & Micro-interaction Stack**: Radix UI primitives (`@radix-ui/react-dialog`, `dropdown-menu`, `tabs`, `tooltip`, `switch`, `avatar`, `slot`), `class-variance-authority` (CVA), `tailwind-merge` + `clsx`, `lucide-react` icons, `motion` + `gsap` exponential easing, `cmdk` (`⌘K` Command Palette), and `sonner` toast notifications.

---

## 2. Specialized AI Companions

The suite is one chat. You talk to Sino and call a product by @mention, for example `@SinoHelp …` (no comma). Slugs are canonical across repositories ([ADR-0012](docs/decisions/0012-canonical-product-slugs-and-guardrails.md)).

| Companion Slug | Handle | Domain | Primary Focus |
| :--- | :--- | :--- | :--- |
| `sinopeople` | `@SinoPeople` | People & HR | Talent acquisition, onboarding workflows, and HR policy intelligence |
| `sinofinance` | `@SinoFinance` | Finance & FP&A | Cashflow forecasting, burn analysis, and ledger reconciliation |
| `sinosales` | `@SinoSales` | Revenue & Sales | Pipeline scoring, MEDDPICC qualification, and outbound deal strategy |
| `sinosocial` | `@SinoSocial` | Brand & Social | Omnichannel campaign planning, copywriting, and audience analytics |
| `sinohelp` | `@SinoHelp` | Support & SLA | Tier-2 technical triage, root-cause diagnostics, and ticket routing |
| `sinoinsights` | `@SinoInsights` | Executive BI | Cross-functional KPI synthesis, cohort telemetry, and predictive insights |

`sineva-ai` also has an orchestrator with the slug `sino`; the six slugs above are the product slugs the platform registry holds.

### Chat

`POST /api/v1/agents/{agent_slug}/chat` with a `snake_case` body (`session_id` is an optional UUID; omit it on the first turn):

```json
{
  "user_id": "usr_01J9ZQ4K7M",
  "message_text": "What is our current monthly burn rate and runway?",
  "context_metadata": { "locale": "id-ID", "channel": "web_chat" }
}
```

The reply `data` mirrors `sineva-ai`'s chat response: `message_id`, `session_id`, `agent_slug`, `display_name`, `handle`, `routed_agent_slug`, `reply_content`, `model_id`, `execution_mode`, `token_usage`, `tool_calls`, `citations`, `created_at`, plus `latency_ms` measured by the platform. This replaced the earlier `reply_text`, `reasoning_summary` and `suggested_actions`. Endpoint details: [`docs/api-spec/agents_and_chat_endpoints.md`](docs/api-spec/agents_and_chat_endpoints.md).

---

## 3. Repository & Monorepo Structure

```text
sineva-platform/
├── apps/
│   └── web/                        # @sineva/web: Next.js 16 App Router BFF
│       ├── prisma/                 # schema.prisma, migrations/, seed.ts (schema `platform`)
│       ├── prisma.config.ts        # Prisma CLI config (datasource URL, migrations path, seed)
│       └── src/
│           ├── app/                # Routing edge: pages, /api-docs (static OpenAPI view), /api/v1/* handlers
│           ├── server/             # Backend ('server-only')
│           │   ├── domain/         # Entities, repository contracts, domain errors
│           │   ├── application/    # Use cases & snake_case Zod DTOs
│           │   ├── infrastructure/ # Prisma Postgres, Redis, SeaweedFS S3, AI Engine Gateway, OpenAPI
│           │   ├── http/           # snake_case response helper, view-type contract guards
│           │   └── container.ts    # Composition root
│           ├── client/             # Frontend: components/, store/ (Redux Toolkit)
│           ├── shared/             # Wire/view types both sides may import (agent_view, chat_view)
│           └── __tests__/          # Unit tests with fakes, contract/ (sineva-ai fixtures), integration/, architecture.test.ts
├── packages/
│   ├── shared/                     # @sineva/shared: canonical snake_case response utility and types
│   └── ui/                         # @sineva/ui: shared token-driven UI primitives (Button, Card, Badge, etc.)
├── docs/                           # Multi-folder YAML-frontmatter documentation suite (see docs/README.md)
├── .github/workflows/ci.yml        # GitHub Actions CI pipeline (lint, typecheck, test, build)
├── docker-compose.yml              # Full shared stack (Postgres, Redis, SeaweedFS S3, Qdrant, sineva-ai, web)
├── Dockerfile                      # Multi-stage Node 24 Alpine production image
├── AGENTS.md                       # Engineering & architectural rules for AI coding agents
└── CLAUDE.md                       # Reference pointer to @AGENTS.md
```

---

## 4. Prerequisites

- **Node.js**: `v24.21.0` (specified in `.nvmrc`; `engines` in `package.json` is `>=24.0.0`)
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

Key environment variables (the code defaults are in `getEnvConfig()`, `apps/web/src/server/infrastructure/config/env.ts`):
- `DATABASE_URL=postgresql://sineva_user:sineva_secret_password@localhost:5432/sineva_platform` (plain URL: no `?schema=`; see the migration step below)
- `REDIS_URL=redis://localhost:6379/0`
- `S3_ENDPOINT=http://localhost:8333`
- `S3_BUCKET_NAME=sineva-assets`
- `AI_ENGINE_INTERNAL_URL=http://sineva-ai:8000` (resolves only inside the Docker network)
- `AI_ENGINE_INTERNAL_API_KEY`: the shared secret sent as `X-Internal-Api-Key`. `docker-compose.yml` passes the same value to `sineva-ai` as `INTERNAL_API_KEY` (`${AI_ENGINE_INTERNAL_API_KEY:-sineva_internal_service_token_dev}` on both services), so set it once in `.env`. The default is a known dev value; use your own anywhere that is not a laptop.
- `AI_ENGINE_TIMEOUT_MS` (default `15000`): how long the gateway waits for `sineva-ai` before returning `503`.
- `TEST_DATABASE_URL`: only for `npm run test:integration`; the database name must contain "test".

---

## 6. How to Run

### Database setup (both options, once per database and after each new migration)

The platform tables live in the `platform` schema, and migrations are an explicit step, not part of the Docker `CMD`. Use `?schema=platform` on the URL for `migrate deploy` only, so Prisma's `_prisma_migrations` table lands in `platform` and not in `public` ([ADR-0005](docs/decisions/0005-prisma-replaces-drizzle.md)):

```bash
docker compose up -d postgres
DATABASE_URL="postgresql://sineva_user:sineva_secret_password@localhost:5432/sineva_platform?schema=platform" \
  npm --workspace=@sineva/web run db:migrate:deploy
npm --workspace=@sineva/web run db:seed   # uses the plain DATABASE_URL from .env
```

Never run `prisma migrate reset` or `prisma db push` against this database, and never accept a reset prompt: it is shared with `sineva-ai`. Create new migrations with `db:migrate:dev` against a throwaway database and a plain URL ([ADR-0006](docs/decisions/0006-shared-postgres-platform-schema.md)).

If an existing database was seeded earlier with the old `sino-*` slugs, re-seeding adds the canonical rows and leaves the old ones. Remove or rename them by hand ([ADR-0012](docs/decisions/0012-canonical-product-slugs-and-guardrails.md)).

### Option A: Run Local Development Server (UI and BFF iteration)
Needs Postgres from the step above. The agent registry is read from Postgres, so a missing database fails the request. The Redis cache is still an in-memory stub and the S3 presign returns an unsigned URL when signing fails (known debt, [ADR-0008](docs/decisions/0008-no-silent-fallbacks.md)), so a green page here does not prove Redis or SeaweedFS work. `sineva-ai` has no host port, so chat returns `503` in this mode. Use Option B to exercise chat.

```bash
npm run dev
```

- **Web Platform & Companion Workspace**: [http://localhost:3000](http://localhost:3000)
- **OpenAPI 3.1 view (static, not Swagger UI)**: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
- **Raw OpenAPI 3.1 JSON Spec**: [http://localhost:3000/api/openapi.json](http://localhost:3000/api/openapi.json)
- **System Health Endpoint**: [http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health) (the Postgres entry only checks that `DATABASE_URL` is set; it does not ping)

### Option B: Run the Full Containerized Stack (Docker Compose)
Brings up PostgreSQL 17, Redis 7.4, SeaweedFS (Master, Volume, Filer, S3 Gateway), Qdrant, `sineva-ai` (port `8000`, `expose` only, no host port), and `sineva-platform` (port `3000`). Postgres, Redis, Qdrant and the SeaweedFS master, filer and S3 ports are published on the host too. Run the database setup above after the containers are up, and apply the `sineva-ai` migration from its image (the comment in `sineva-ai/Dockerfile` names this command):

```bash
npm run docker:up
# or directly:
docker compose up -d --build

docker compose run --rm sineva-ai alembic upgrade head
```

Known `sineva-ai` issue, reported to us and not re-verified by building the image: its Dockerfile copies `pyproject.toml` and `src` but not the `README.md` that `pyproject.toml` declares, so the image build can fail. Check `../sineva-ai` before relying on this path.

To stop the stack and keep data:
```bash
docker compose down
```

`npm run docker:down` runs `docker compose down -v`, which also deletes the volumes, including the Postgres data shared with `sineva-ai`.

---

## 7. Quality Gates (Lint, Typecheck, Test, Build)

```bash
# Run ESLint across all Turborepo packages
npm run lint

# Run prisma generate, Next.js typegen and the TypeScript strict compiler check
npm run typecheck

# Run Vitest: unit tests with fakes, contract tests, architecture.test.ts (no database needed)
npm run test

# Build production bundles via Turborepo (runs prisma generate first)
npm run build

# Prisma against a throwaway database; run it when database code changes.
# Create the empty database first, for example:
#   docker compose exec postgres createdb -U sineva_user sineva_platform_test
TEST_DATABASE_URL="postgresql://sineva_user:sineva_secret_password@localhost:5432/sineva_platform_test" \
  npm run test:integration
```

`test:integration` truncates every platform table before each test, so it refuses any database whose name does not contain "test". CI runs lint, typecheck, test and build only; it has no Postgres, so integration tests do not run there.

The contract tests use fixtures copied byte for byte from `sineva-ai/tests/contract/fixtures`. Do not edit the copies; change them in `sineva-ai` and copy them here in the same change ([ADR-0015](docs/decisions/0015-sineva-ai-owns-internal-chat-contract.md)).

---

## 8. Documentation (`docs/`)

Start at [`docs/README.md`](docs/README.md) for the complete index of agent-ready markdown documentation:
- **[`docs/project-structure/`](docs/project-structure/)**: Monorepo overview, Turborepo workspaces, Clean Architecture layers
- **[`docs/engineering/`](docs/engineering/)**: Coding standards, design patterns, `snake_case` response pattern, database conventions, migrations workflow, Redux state management, testing strategy
- **[`docs/design-context/`](docs/design-context/)**: AI-Native design system, 3-layer design tokens, UX & frontend libraries, brand copywriting
- **[`docs/api-spec/`](docs/api-spec/)**: API overview, Swagger/OpenAPI guide, agents & chat endpoints, storage & health endpoints
- **[`docs/troubleshooting/`](docs/troubleshooting/)**: Common issues, Docker & internal network debugging, storage/DB/Redis runbooks
- **[`docs/development/`](docs/development/)**: Product roadmap, vertical-slice feature workflow, future features template, known issues and tech debt
- **[`docs/deployment/`](docs/deployment/)**: Docker Compose topology, internal network security, CI/CD pipeline, environment variables
- **[`docs/decisions/`](docs/decisions/)**: Architecture decision records (BFF gateway, storage, wire contract, app structure, Prisma, shared Postgres, testing, wording, slugs, internal auth, UUID keys, the sineva-ai chat contract, 502 and 503)
- **[`docs/governance/`](docs/governance/)**: Numbered agent rules, Git and PR workflow
- **[`docs/product/`](docs/product/)**: Product model and wording
