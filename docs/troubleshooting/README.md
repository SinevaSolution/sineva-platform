---
title: "Troubleshooting"
category: "troubleshooting"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "troubleshooting", "runbook", "index"]
summary: "Index of the runbooks for build, Prisma, database, storage, cache and sineva-ai connectivity problems, organized by symptom."
related_docs:
  - "../README.md"
  - "../deployment/README.md"
  - "../engineering/README.md"
  - "../governance/agent_rules.md"
---

# Troubleshooting

Runbooks for problems you hit while developing or running sineva-platform. Each entry gives the symptom, the cause and the fix, and says which parts were reproduced. It does not explain how things are meant to work (see [engineering](../engineering/README.md) and [deployment](../deployment/README.md)) and it is not a list of known issues (that is `docs/development/known_issues_and_tech_debt.md`).

## Files

| File | What it covers | Read it when |
| :--- | :--- | :--- |
| [common_issues.md](common_issues.md) | Missing Prisma client, empty `DATABASE_URL`, `server-only` and architecture test failures, integration test guard, 422 validation, stale caches | The build, typecheck, lint or tests fail |
| [docker_and_internal_network.md](docker_and_internal_network.md) | Chat 404, 422, 502 and 503 triage by log line, key mismatch, contract drift, health `standby`, network checks, stale `sino-*` rows | Chat fails or `sineva-ai` looks unreachable |
| [storage_db_and_redis.md](storage_db_and_redis.md) | Prisma P1001 and P1000, missing schema or seed data, history in `public`, reset prompts, presigned uploads, the in-memory cache | A database, upload or cache symptom |

## Quick pointers

| You see | Open |
| :--- | :--- |
| `P1001`, `P1000`, `P3005`, "relation does not exist", empty dashboard | [storage_db_and_redis.md](storage_db_and_redis.md) |
| A prompt to reset the database | Say no, then [storage_db_and_redis.md](storage_db_and_redis.md#a-reset-or-drift-prompt) |
| Chat returns 502 or 503 | [docker_and_internal_network.md](docker_and_internal_network.md) |
| `Cannot find module` for the Prisma client, `server-only` error, architecture test red | [common_issues.md](common_issues.md) |

## Suggested reading order

Read none of it in advance; find the symptom. When the cause is not in these pages, check the container logs (`docker compose logs <service>`), then `GET /api/v1/health`, remembering that only its `sineva_ai_engine` entry performs a real check.

## Related

- Folders: [deployment](../deployment/README.md), [engineering](../engineering/README.md).
- Rules: R-18 and R-19 (no reset or push against a shared database), R-26 (no hidden failures), R-29 (`sineva-ai` internal only). See [agent rules](../governance/agent_rules.md).
- Decisions: [ADR-0006](../decisions/0006-shared-postgres-platform-schema.md), [ADR-0008](../decisions/0008-no-silent-fallbacks.md), [ADR-0015](../decisions/0015-sineva-ai-owns-internal-chat-contract.md), [ADR-0016](../decisions/0016-upstream-failures-return-502-503.md).
