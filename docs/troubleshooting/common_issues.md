---
title: "Common Build & Development Troubleshooting"
category: "troubleshooting"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "troubleshooting", "turborepo", "typescript", "nextjs", "vitest"]
summary: "Runbook for resolving common local development, Turborepo caching, TypeScript module resolution, and Vitest issues in sineva-platform."
related_docs:
  - "docker_and_internal_network.md"
  - "storage_db_and_redis.md"
  - "../project-structure/turborepo_workspaces.md"
---

# Common Build & Development Troubleshooting

---

## 1. `Cannot find module '@sineva/shared'` or `@sineva/ui` During Typecheck

### Symptom
Running `tsc --noEmit` directly inside `apps/web` fails because `packages/shared/dist` or `packages/ui/dist` has not been built yet.

### Resolution
Always run tasks from the repository root via Turborepo so `"dependsOn": ["^build"]` builds upstream packages first:
```bash
npm run build
npm run typecheck
```

---

## 2. Stale Turborepo or Next.js Cache

### Symptom
Changes in `packages/shared/src/response.ts` or `packages/ui/src/index.tsx` do not appear immediately in `apps/web`.

### Resolution
```bash
rm -rf apps/web/.next packages/shared/dist packages/ui/dist node_modules/.cache
npm run build
```

---

## 3. `400 Bad Request` (`INVALID_KEY_CONVENTION`) on API Calls

### Symptom
Sending a `POST` body to `/api/v1/agents` or `/api/v1/storage/presign` returns `400 Bad Request`.

### Root Cause
One or more JSON keys in your request body use `camelCase` (e.g., `agentSlug` or `fileName`) instead of `snake_case` (`agent_slug`, `file_name`).

### Resolution
Ensure all request keys use strict `snake_case` or pass payloads through `toSnakeCaseObject()` from `@sineva/shared`.
