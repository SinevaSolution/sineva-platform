---
title: "ADR-0008: No silent fallbacks"
category: "decisions"
status: "active"
version: "1.1.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "reliability", "error-handling", "tech-debt"]
summary: "Adapters throw domain errors on failure; no empty catch, no fabricated data, no quiet substitute for a failed dependency."
related_docs:
  - "0001-bff-gateway.md"
  - "0002-seaweedfs-presigned-uploads.md"
  - "0016-upstream-failures-return-502-503.md"
  - "../engineering/error_handling_and_failure_modes.md"
  - "../development/known_issues_and_tech_debt.md"
adr_id: "0008"
decision_status: "Accepted"
supersedes: []
---

# ADR-0008: No silent fallbacks

## Status

Accepted (2026-10-21). The AI gateway fallback is deleted; the debt listed below remains.

Cross-service: mirrored in sineva-ai `docs/decisions/` (a sineva-ai ADR of the same title; that folder does not exist yet, so no number is cited). Change both repos together. The cross-service part is the upstream-failure behavior in [ADR-0016](0016-upstream-failures-return-502-503.md); the other debt below is platform-only.

## Context

The first scaffold was built so the UI worked with no infrastructure running. To get there, several adapters swallowed errors and returned plausible substitute data. A user or operator cannot tell a real result from a substitute, and a failing dependency looks healthy. The AI gateway was the worst case, and it has been fixed (see below). Other adapters still do this.

## Decision

- No empty `catch` blocks. A `catch` either handles the error with a defined behavior or rethrows.
- No fabricated data: no invented IDs, token counts, versions, health results or reply text standing in for a real result.
- Adapters in `server/infrastructure` throw domain errors (`DomainError` and its subclasses in `server/domain/errors/domain_error.ts`) when a dependency fails. Route handlers turn those into the standard error envelope through `response_helper`.
- A health check reports what it measured. It does not return `true` without checking.
- Local development without a dependency is done by running the dependency (Docker Compose) or by injecting a fake in tests, not by a production fallback path.

## Done: the AI gateway fallback is deleted

`InternalAiEngineGateway` (`server/infrastructure/gateways/internal_ai_engine_gateway.ts`) used to catch every failure and return a canned companion reply built from `COMPANION_PLAYBOOKS`, with made-up values for missing fields. That code is gone. Now:

- A non-2xx answer, a body that is not JSON, or a body that fails the Zod envelope check throws `UpstreamServiceError` (502).
- A network error, timeout or abort throws `UpstreamUnavailableError` (503).
- No field is filled with an invented value. `latency_ms` is measured.

Details and the reasoning are in [ADR-0016](0016-upstream-failures-return-502-503.md).

## Known debt (not patterns to copy)

Current code that still violates this decision. Do not add to it and do not copy it. Track removal in [known issues and tech debt](../development/known_issues_and_tech_debt.md).

- `InternalAiEngineGateway.checkHealth()` returns a hardcoded `engine_version` (`'1.0.0'`, or `'1.0.0-standby'` when unreachable). It reports reachability from a real call, but the version is not read from `sineva-ai`.
- `GetSystemHealthUseCase` reports Postgres as healthy whenever `DATABASE_URL` is set. There is no ping.
- `RedisCacheRepository` (`server/infrastructure/cache/redis_cache_repository.ts`) stores values in an in-process `Map` and never calls Redis. `ping()` returns `true` unconditionally, so the health endpoint cannot report a Redis outage.
- `SeaweedStorageRepository` returns an unsigned upload URL when signing throws, and `checkHealth()` only checks that `S3_ENDPOINT` is set.
- `getEnvConfig()` (`server/infrastructure/config/env.ts`) falls back to hardcoded credentials when environment variables are missing.

## Consequences

- Failures become visible: a 5xx with an error envelope instead of a believable but fake 200. The chat now fails with 502 or 503 when `sineva-ai` is down or wrong, and the dashboard shows an error toast with Retry.
- Local development needs the real dependencies running or tests with fakes. Standalone `npm run dev` shows errors for the unavailable services.
- Removing the remaining debt changes visible behavior the same way (a Redis outage will show in the health endpoint), so each removal needs a test and a UI error state ([ADR-0007](0007-tdd-fakes-integration-containers.md)).

## Alternatives considered

- Keep fallbacks for demo convenience. Rejected: a demo that hides failures also hides real outages in production.
