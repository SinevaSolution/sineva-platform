# AGENTS.md: sineva-platform

Router for AI coding agents and humans. Details live in `docs/`. The numbered rules (R-xx) are in [`docs/governance/agent_rules.md`](docs/governance/agent_rules.md). Decisions are in [`docs/decisions/`](docs/decisions/README.md).

"Current" means what the code does today. "Target" means decided, not yet built.

## 1. What this repo is

- Sineva Platform: the web app and BFF (Backend-for-Frontend) for the Sineva suite. It is the only public entry point; `sineva-ai` (Python FastAPI) is reachable only over the internal Docker network.
- Turborepo monorepo (npm workspaces): `apps/web` (`@sineva/web`), `packages/shared` (`@sineva/shared`: response envelope, PII masking), `packages/ui` (`@sineva/ui`).
- Stack: Next.js 16.4 App Router, React 19.2, TypeScript 5.7, Redux Toolkit, Tailwind 4, Zod, Prisma 7.10.1 (`@prisma/adapter-pg`), ioredis, AWS SDK S3, Vitest. Node 24 (`.nvmrc`).
- Shared infrastructure with `sineva-ai`: Postgres 17 (database `sineva_platform`), Redis 7.4, SeaweedFS S3, Qdrant (used by `sineva-ai`).

## 2. Read this first

| If you are... | Read |
| :--- | :--- |
| Choosing where code goes | [clean_architecture_layers](docs/project-structure/clean_architecture_layers.md), [frontend_architecture](docs/project-structure/frontend_architecture.md), ADR-0004 |
| Adding or changing an API route | [api-spec/overview](docs/api-spec/overview.md), [response_pattern](docs/engineering/response_pattern.md), [swagger_and_openapi](docs/api-spec/swagger_and_openapi.md) |
| Touching the database | [database_conventions](docs/engineering/database_conventions.md), [database_migrations_workflow](docs/engineering/database_migrations_workflow.md), ADR-0005, ADR-0006, ADR-0014 |
| Touching the sineva-ai chat contract | [agents_and_chat_endpoints](docs/api-spec/agents_and_chat_endpoints.md), ADR-0015, ADR-0016 |
| Writing tests | [testing_strategy](docs/engineering/testing_strategy.md), ADR-0007 |
| Handling errors or failures | [error_handling_and_failure_modes](docs/engineering/error_handling_and_failure_modes.md), ADR-0008, ADR-0016 |
| Building UI | [design_system](docs/design-context/design_system.md), [design_tokens](docs/design-context/design_tokens.md), [state_management_redux](docs/engineering/state_management_redux.md) |
| Writing user-facing copy | [product_model_and_wording](docs/product/product_model_and_wording.md), [copywriting_and_brand](docs/design-context/copywriting_and_brand.md), ADR-0010 to ADR-0012 |
| Running or deploying | [docker_compose_topology](docs/deployment/docker_compose_topology.md), [environment_variables](docs/deployment/environment_variables.md), [ci_cd_pipeline](docs/deployment/ci_cd_pipeline.md) |
| Debugging | [troubleshooting/common_issues](docs/troubleshooting/common_issues.md) |
| Committing or opening a PR | [git_and_pr_workflow](docs/governance/git_and_pr_workflow.md) |
| Planning a feature | [feature_development_workflow](docs/development/feature_development_workflow.md), [known_issues_and_tech_debt](docs/development/known_issues_and_tech_debt.md) |

Full index: [`docs/README.md`](docs/README.md).

## 3. Commands

From the repo root:

```bash
npm install
npm run dev               # prisma generate, then Next.js on 127.0.0.1:3000
npm run lint              # eslint, zero warnings
npm run typecheck         # prisma generate, next typegen, tsc --noEmit
npm run test              # vitest unit tests, contract tests, architecture.test.ts (no DB)
npm run test:integration  # Prisma against a throwaway Postgres; needs TEST_DATABASE_URL
npm run build             # prisma generate, then next build
npm run docker:up         # full stack: docker compose up -d --build
```

Database scripts live in `apps/web` and run through the workspace, for example `npm --workspace=@sineva/web run db:generate`: `db:generate`, `db:migrate:dev`, `db:migrate:deploy`, `db:seed`. `TEST_DATABASE_URL` must name a database whose name contains "test"; the setup refuses anything else.

## 4. Hard rules (summary; the rule text and checks are in agent_rules.md)

- TDD: failing test first, with red evidence (R-01). Done means lint, typecheck, test, build pass, plus `test:integration` for database code (R-02).
- Conventional Commits; PRs use the template with evidence (R-03, R-04). Surgical edits; ask on ambiguity (R-05, R-06).
- Layers: domain, then application and infrastructure inward only (R-07, R-12, R-13). Client never imports `@/server` (R-08). `import 'server-only'` on infrastructure and container (R-09). Adapters built only in `server/container.ts` (R-10). Thin route handlers (R-11). Shared view types guarded (R-14).
- Prisma only, pinned exactly to 7.10.1 (R-15, R-16). Tables in schema `platform` (R-17). UUID primary keys, column `id` (R-21, R-39). Never reset or push against a shared DB; `migrate dev` on throwaway DBs only; `migrate deploy` with `?schema=platform`; commit migration SQL (R-18 to R-20, R-42). Never edit the generated client (R-22).
- snake_case on the wire and in the DB; envelope via `response_helper`; register routes in OpenAPI (R-21, R-23 to R-25). The sineva-ai chat contract is owned by sineva-ai; fixtures are copied, not edited (R-40).
- No silent fallbacks; upstream failures are typed 502 or 503 (R-26, R-41). No new hardcoded secrets, no identity from request bodies in new code, `sineva-ai` internal only (R-27 to R-29).
- Semantic tokens only; loading, error and not-found states; WCAG 2.2 AA (R-30 to R-32).
- Wording, guardrails, generic integrations, @mention syntax, canonical slugs; update docs in the same change (R-33 to R-38).

## 5. Layout

```text
apps/web/
  prisma/                  schema.prisma, migrations/, seed.ts (platform schema only)
  prisma.config.ts
  src/
    app/                   routing edge: pages, layouts, /api/v1/* handlers
    server/                backend, 'server-only'
      domain/              entities, ports, domain errors (incl. 409, 502, 503 types)
      application/         use cases, Zod DTOs
      infrastructure/      adapters (database, cache, storage, gateways, config, openapi)
      http/                response_helper, agent_view_contract, chat_view_contract
      container.ts         the only place adapters are constructed
    client/                components/, store/ (Redux Toolkit)
    shared/                wire/view types (agent_view, chat_view)
    __tests__/             unit tests, fakes/, contract/ (+ fixtures/), integration/, stubs/, architecture.test.ts
packages/shared/           @sineva/shared: response envelope, snake_case helpers, pii/ (identifier detectors and mask)
packages/ui/               @sineva/ui (cards/: static card registry and the fallback renderer, path alias @sineva/ui/cards)
packages/card-schemas/     @sineva/card-schemas: card JSON Schemas, validator, generated types (server only; path alias, ADR-0025)
packages/i18n/             locale registry, message formatter, copy lint (path alias @sineva/i18n, not a workspace link)
docs/                      see docs/README.md
```

## 6. Gotchas

- Prisma: never install `prisma`, `@prisma/client` or `@prisma/adapter-pg` unpinned. On 2026-10-21 npm `latest` for `prisma` was `8.0.0-rc.23` (a release candidate). Use `npm install --save-exact <pkg>@7.10.1`.
- The Postgres database is shared with `sineva-ai`. The platform owns schema `platform`; `sineva-ai` owns schema `sineva_ai` (Alembic). Nobody uses `public`. Check `DATABASE_URL` before any Prisma command.
- `_prisma_migrations` placement: with a plain `DATABASE_URL` Prisma puts its bookkeeping table in `public`. With `?schema=platform` it goes to `platform`, but `migrate dev` then emits unqualified SQL. So: `migrate dev` on a throwaway DB with a plain URL; `migrate deploy` on the shared DB with `?schema=platform`. Migrations are an explicit release step, not part of the Docker `CMD`.
- `prisma.config.ts` reads `process.env.DATABASE_URL ?? ''` on purpose: `env()` throws when the variable is unset, and `generate`, `build` and `typecheck` must run without a database. Commands that connect (`migrate`, `db seed`) fail on the empty URL.
- Primary keys are UUID (`gen_random_uuid()`, v4). Do not add prefixed string ids, and do not hand-generate ids in application code.
- Compose publishes Postgres (5432), Redis (6379, no password), Qdrant (6333) and the SeaweedFS master, filer and S3 ports (9333, 8888, 8333) on the host. Only `sineva-ai` (8000, `expose` only) and `seaweedfs-volume` have no host port. "Only public entry point" describes application traffic, not these data-store ports ([docker_compose_topology](docs/deployment/docker_compose_topology.md)).
- `npm run docker:down` is a plain `docker compose down` and keeps volumes. `npm run docker:reset` runs `down -v`, which deletes all volumes including the shared Postgres data, and refuses to run unless `CONFIRM_RESET=yes` is set.
- `server-only` throws outside a React Server Components build. Vitest aliases it to `src/__tests__/stubs/server_only.ts` (`apps/web/vitest.config.ts` and `vitest.integration.config.ts`). Keep both aliases.
- The container memoizes adapters, including the Prisma connection pool, so state persists across calls in one process. There is no reset hook (`resetContainerForTests` was removed). Unit tests build use cases with fakes directly, and route tests mock `@/server/container`; do not reach into the container from tests.
- `src/__tests__/contract/fixtures/` are copied byte-for-byte from `../sineva-ai/tests/contract/fixtures/`. Never edit the copies. Change them in `sineva-ai` first, copy them here in the same change, and open the matching change in both repos (ADR-0015).
- Re-seeding an existing database that was seeded with the old `sino-*` slugs leaves stale rows. `prisma/seed.ts` upserts by `agent_slug`, so it adds the canonical rows and never removes or renames the old ones. Fix such a database with a manual or data migration (ADR-0012).
- Known debt: see [known_issues_and_tech_debt](docs/development/known_issues_and_tech_debt.md). The cache is a real ioredis adapter, health is probed, presign fails with a 502 instead of returning an unsigned URL, and credentials have no default in code: development reads them from `.env.example`, production must supply real ones or startup fails.
- Cross-service: `sineva-ai` has migrated to the canonical slugs (`sinopeople`, `sinofinance`, and so on; its orchestrator is `sino`), so the old `sino_*` mismatch no longer exists. It owns the chat contract (ADR-0015): the platform sends `user_message` and reads `reply_content`, so the public chat response no longer has `reply_text`. The internal header is `X-Internal-Api-Key` (ADR-0013). `sineva-ai` non-2xx or an invalid body becomes 502, and an unreachable `sineva-ai` becomes 503 (ADR-0016).

## 7. Product wording

- One chat: the user talks to Sino and calls a product by @mention, `@SinoHelp …`, no comma.
- User-facing copy: Sino is a "companion" (ID: "teman kerja", "teman AI"). Never "chatbot", "assistant" or "agent". Code identifiers and `/api/v1/agents` keep "agent".
- Slugs: `sinopeople`, `sinofinance`, `sinosales`, `sinosocial`, `sinohelp`, `sinoinsights`. SinoMoney is now SinoFinance.
- Guardrails and integrations wording: R-34, R-35, and [product_model_and_wording](docs/product/product_model_and_wording.md).

## 8. Workflow

1. TDD: write the failing test and watch it fail.
2. Implement the smallest change that passes.
3. Verify: `npm run lint && npm run typecheck && npm run test && npm run build` (plus `npm run test:integration` for database code).
4. Commit with Conventional Commits.
5. Open a PR with the template, with evidence for every ticked item. See [git_and_pr_workflow](docs/governance/git_and_pr_workflow.md).

## 9. Nested AGENTS.md

More specific rules apply inside these folders. Read them when you work there.

- [`apps/web/src/server/AGENTS.md`](apps/web/src/server/AGENTS.md): backend layers, container, adapters
- [`apps/web/src/client/AGENTS.md`](apps/web/src/client/AGENTS.md): components, store, boundary rules
- [`apps/web/src/app/AGENTS.md`](apps/web/src/app/AGENTS.md): routes and handlers
- [`apps/web/prisma/AGENTS.md`](apps/web/prisma/AGENTS.md): schema, migrations, safety
