---
title: "Hosting the Platform on Vercel"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "deployment", "vercel", "serverless", "cron", "migrations"]
summary: "The platform deploys to Vercel as one project rooted at apps/web, with external Postgres, Redis, S3-compatible storage and SMTP. Vercel Cron authenticates with a CRON_SECRET bearer accepted only on the job routes. Migrations run during the production build under a safety gate (Founder decision). Serverless limits and their consequences are recorded."
related_docs:
  - "README.md"
  - "../deployment/vercel.md"
  - "../deployment/environment_variables.md"
  - "../engineering/database_migrations_workflow.md"
  - "0006-shared-postgres-platform-schema.md"
  - "0013-internal-service-auth-header.md"
  - "0022-run-handle-and-sse-relay.md"
adr_id: "0047"
decision_status: "accepted"
supersedes: []
---

# 0047 Hosting the Platform on Vercel

Accepted on the Founder's delegation, using the recommended option. The migration-during-build rule below is an explicit Founder decision that overrides the repository rule "migrations are a separate release step, never part of the build" for Vercel only.

## Context

The platform ran only as a long-lived container next to Postgres, Redis, SeaweedFS and `sineva-ai` on one Docker network. The Founder wants it on Vercel (custom domain `sineva.id`). Vercel runs request handlers as short-lived, scaled-out functions, so process memory is not shared between requests, there is no scheduler, and data stores must be reachable over the internet.

## Decision

1. **One Vercel project, Root Directory `apps/web`.** `apps/web/vercel.json` holds the config. Install runs from the repository root (`cd ../.. && npm ci`) so npm workspaces and the source-only `@sineva/*` packages resolve (they are transpiled by Next, no `dist`). Vercel's "include source files outside the Root Directory" setting stays on, because `tsconfig` paths and `transpilePackages` point at `../../packages`. The Build Command is `node scripts/vercel_build.mjs`. Node is `24.x` through `engines` in `apps/web/package.json` (Vercel offers majors only). Local, Docker and CI keep the exact `.nvmrc` pin; on Vercel the guard enforces the major and warns on an older patch, because Vercel owns the patch level.
2. **External services.** Postgres with a pooled runtime URL (Neon recommended) and a direct URL for migrations; Redis over TLS (`rediss://`, Upstash recommended); an S3-compatible bucket (Cloudflare R2 recommended: `S3_REGION=auto`, presigned URLs only work on the S3 API domain, CORS for `PUT` from the app origin); an SMTP provider; `sineva-ai` on a public HTTPS URL protected by `X-Internal-Api-Key` plus the signed context. `DATABASE_POOL_MAX` (default 10, recommend 5 on Vercel) bounds the pg pool per instance.
3. **Cron authentication.** Vercel Cron only issues `GET` and cannot send custom headers; it sends `Authorization: Bearer $CRON_SECRET`. The job routes (`/api/internal/v1/inbox/expire`, and the Connections job tick) accept that bearer in addition to `X-Internal-Api-Key`, and export `GET` next to `POST`. The ingest routes that `sineva-ai` calls (approvals, input requests, audit events, ingest events, keys) do not accept it, so the cron secret cannot write data there. `CRON_SECRET` is optional (Docker has no cron), at least 16 characters when set, compared as SHA-256 digests in constant time, and when unset the bearer path never matches (`Bearer undefined` is refused). The job use cases are idempotent, which also covers Vercel's best-effort, possibly duplicated delivery.
4. **Migrations run during the production build (Founder decision).** `scripts/vercel_build.mjs` runs `prisma migrate deploy` before `next build`, only when `VERCEL_ENV=production`. Preview builds skip migrations unless `PREVIEW_DATABASE_URL` names a separate preview database; a preview build never touches the production database. Local and Docker builds do not migrate. Guardrails:
   - **Direct connection.** `DIRECT_DATABASE_URL`, or `DATABASE_URL` only when it is not a pooler URL (Neon `-pooler` host, Supabase pooler host or port 6543, `pgbouncer=true`). Prisma's advisory lock does not work through a transaction pooler. The script forces `?schema=platform` (`_prisma_migrations` lives in `platform`) and refuses another schema. The runtime keeps the pooled `DATABASE_URL`.
   - **Failure stops the deploy.** Any failure exits non-zero before `next build`, so the previous deployment stays live. Output is redacted: the URL, user and password are never printed.
   - **Destructive gate.** Pending migrations (from `prisma migrate status`, never already-applied ones) are scanned for `DROP TABLE`, `DROP COLUMN`, `DROP SCHEMA`, `TRUNCATE` and `DELETE FROM` without `WHERE`. A hit fails the build unless that migration folder contains `APPROVED_DESTRUCTIVE.md` with a written reason. A database with no migration history (all migrations pending) is empty by definition and is not gated.
   - **Concurrent builds** are serialized by Prisma's advisory lock; the second one waits and fails if the lock is not released in time, and a redeploy fixes it.
   - **Expand, then contract.** Because the old deployment serves traffic while the new build migrates, and a build that fails after migrating leaves the new schema under the old code, every migration must be backward compatible with the previous release: add first, switch code, remove in a later release.
5. **Serverless constraints accepted.**
   - `RunHub` and `RunSession` are per instance. A reconnect that lands on another instance finds no live session and is served from `sineva-ai`'s stored events (`pumpReplay`, ADR-0022) as long as the run already recorded its `upstream_run_id`; before that it gets the retryable `run_busy` 409. A drain whose instance froze is finished by the next resume (`adopt`).
   - Known gap: when the browser leaves and the instance freezes, the reply is stored only when someone resumes the run. A follow-up (Next `after()` to keep the drain alive, or a sweep) is not part of this decision.
   - `maxDuration`: 300 s for the run event stream (the Hobby and Pro default and the Hobby maximum), 60 s for the other upstream-calling routes and the cron job routes. The relay's own 5 minute replay deadline equals the Hobby limit; the client reconnects with `Last-Event-ID`.
   - Cron per minute needs the Pro plan. Hobby runs a cron once per day and rejects a deployment whose expression is more frequent; per-minute scheduling then needs an external scheduler calling the same routes with the bearer.
   - Preview deployments also build with `NODE_ENV=production`, so they need the full set of non-development values (separate staging services), and OAuth sign-in does not work on per-deployment preview URLs because providers do not accept wildcard redirect URIs.
   - The Content Security Policy is report-only today. When it is enforced, `connect-src` must allow the storage public endpoint, or browser uploads will be blocked.

## Consequences

- A production deploy needs a prepared database and the variables in [vercel.md](../deployment/vercel.md); without `DIRECT_DATABASE_URL` or a non-pooler `DATABASE_URL` the production build fails on purpose.
- Merging a destructive migration to the production branch needs an approval marker in the same change, which makes the intent visible in review.
- The CVE-2026-111497 patch check is weaker on Vercel (major only, warning). It must be checked in the build log.
- Docker Compose remains the supported self-hosted topology; nothing in it changes.

## Alternatives considered

- **Separate release step for migrations** (the repository rule): safer against a half-applied release, rejected by the Founder for convenience; the gate and expand-contract policy are the compensating controls.
- **Root Directory at the repository root:** needs custom output settings and exposes the whole repo to the build; `apps/web` matches how Next resolves the monorepo.
- **Bearer secret in the cron path's query string:** leaks into logs; rejected.
- **A separate cron-only route:** another route to keep in sync; the existing job route plus `GET` is enough.
- **Accepting the cron bearer on every internal route:** widens what one leaked secret can do; rejected.
