---
title: "CI/CD Pipeline"
category: "deployment"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "ci-cd", "github-actions", "dockerfile", "release", "migrations"]
summary: "What the GitHub Actions workflow runs today, how the Dockerfile builds the image, the release order including database migrations, and the rollout checklist."
related_docs:
  - "docker_compose_topology.md"
  - "environment_variables.md"
  - "../engineering/testing_strategy.md"
  - "../engineering/database_migrations_workflow.md"
  - "../decisions/0007-tdd-fakes-integration-containers.md"
  - "../governance/git_and_pr_workflow.md"
---

# CI/CD Pipeline

"Current" is what the repo does today. "Target" is decided but not built. Test layers and commands are in [testing strategy](../engineering/testing_strategy.md); this page covers the pipeline and the release.

## CI workflow (Current)

`.github/workflows/ci.yml`, workflow "Sineva Platform CI", is the only workflow. One job, `verify`, on `ubuntu-latest`.

Triggers: a push to `main` or `develop`, and a pull request targeting `main` or `develop`.

Steps, in order:

1. `actions/checkout@v4`.
2. `actions/setup-node@v4` with Node `24` and the npm cache. `.nvmrc` pins `24.21.0` locally; CI takes the latest 24.x.
3. `npm ci`.
4. `npm run lint`.
5. `npm run typecheck`.
6. `npm run test`.
7. `npm run build`.
8. `npm run bundle:report --workspace=@sineva/web` reads `.next` after the build, records every client chunk's raw and gzip size, and fails when three.js, GSAP, Recharts, Tiptap or dnd-kit appear in the chunk every page loads (FR-UX-43). The next step uploads `bundle-report.json` as the `bundle-report` artifact. The check looks for each library's fingerprint strings (minification hides module names), so it can miss a library; `architecture.test.ts` also fails a static import of these libraries outside `*.lazy.*` modules.

`npm run lint` and `npm run test` also run the `@sineva/ui` workspace: its ESLint design rules (no hex, `rgb(`, `dark:`, `z-[n]`, physical-direction classes, motion imports or `dangerouslySetInnerHTML`) and its Vitest suite (token drift against the compro snapshot, contrast in both themes, lint rule fixtures). All four commands go through turbo (`lint`, `typecheck`, `test`, `build`) and must pass before merge. `typecheck` and `build` run `prisma generate` first, which needs no database, so CI has no `DATABASE_URL`.

Gaps:

- The `verify` job runs `npm run test`, which excludes `src/__tests__/integration/`. Those run in the separate `integration` job (Postgres 17 and Redis 7 service containers, database `sineva_platform_test`). The `security` job runs `npm audit --omit=dev --audit-level=high`, TruffleHog, a scan for `snv_pat_` tokens and private key blocks, and an SBOM (`npm sbom`).
- There is no deploy job, no image build or push, and no migration job. Deployment is manual.
- Dependabot and a Docker build check are not configured.
- The SBOM is generated and checked for content but not uploaded as an artifact.

The integration job follows [ADR-0007](../decisions/0007-tdd-fakes-integration-containers.md): the database name contains `test` and `TEST_DATABASE_URL` points at the service container. Never point it at a shared database.

## Dockerfile

The root `Dockerfile` has four stages on `node:24-alpine`:

| Stage | What it does |
| :--- | :--- |
| `base` | Sets `WORKDIR /app` and disables Next telemetry |
| `deps` | Adds `libc6-compat`, copies the root and workspace `package.json` files plus `package-lock.json` and `turbo.json`, runs `npm install` |
| `builder` | Takes `node_modules` from `deps`, copies the source, runs `npm run build` (turbo, then `prisma generate`, then `next build`) |
| `runner` | Sets `NODE_ENV=production`, creates a non-root user `nextjs` (uid 1001), copies the whole `/app` from `builder`, exposes 3000 |

`CMD` is `npm --workspace=@sineva/web run start`, which is `next start --hostname 0.0.0.0 --port 3000`.

Facts to know:

- The image contains the generated Prisma client. `.dockerignore` excludes the host's `generated` folder, and the builder regenerates it through `npm run build`. The build needs no database; the home page is `force-dynamic`, so `next build` does not query one.
- The runner is not a slim image. It copies all of `/app`, including source, dev dependencies and the Prisma CLI. That is what lets the release step below run `prisma migrate deploy` from the same image.
- `deps` uses `npm install`, not `npm ci`, so the image build does not enforce the lockfile the way CI does.
- No `HEALTHCHECK` instruction. Use `GET /api/v1/health`.
- `.dockerignore` also excludes `.git`, `docs`, `*.md`, `.env` and `.env.local`, so no secrets from a local env file enter the image.

## Release order

Migrations are an explicit release step. They are not in `CMD` and not in compose, so a starting container never changes the schema, and several replicas never race to apply one migration.

1. Merge to `main` after CI passes.
2. Build the image.
3. Run `db:migrate:deploy` with `?schema=platform` on the database URL ([migrations workflow](../engineering/database_migrations_workflow.md)). On a new environment, also run `db:seed`.
4. Run `sineva-ai`'s own `alembic upgrade head` if its release changed its schema.
5. Start or recreate `sineva-platform`.

Order matters in one direction: apply the migration before the code that needs it starts. Keep migrations backward compatible with the previous release for the window between steps 3 and 5 (add columns before code uses them; remove them one release later).

## Rollout checklist

- [ ] Secrets rotated in the target environment: `POSTGRES_PASSWORD`, `S3_SECRET_ACCESS_KEY` and `AI_ENGINE_INTERNAL_API_KEY` ([environment variables](environment_variables.md)). The values in the repo are public defaults.
- [ ] `docker compose ps` shows `0.0.0.0:3000->3000/tcp` for `sineva-platform` and `8000/tcp` with no host address for `sineva-ai`. Decide on purpose what to do with the published Postgres, Redis, Qdrant and SeaweedFS ports ([topology](docker_compose_topology.md)).
- [ ] `db:migrate:deploy` ran with `?schema=platform`, and `platform._prisma_migrations` exists (not `public._prisma_migrations`).
- [ ] `GET /api/v1/health` returns 200 and `data.subsystems.sineva_ai_engine.status` is `healthy`. This is the only real check in that response: the Postgres entry reports `healthy` whenever `DATABASE_URL` is set, Redis always reports `healthy`, and S3 reports `healthy` whenever an endpoint is configured.
- [ ] `GET /api/v1/agents` returns the six companions. This reaches Postgres, so it proves the database, the schema and the seed.
- [ ] A chat request to one companion returns 200. A 502 or 503 here points at the key, the slug or the engine ([troubleshooting](../troubleshooting/docker_and_internal_network.md)).
- [ ] `/api/openapi.json` loads and lists every route.
