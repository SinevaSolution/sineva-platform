---
title: "ADR-0016: Upstream failures return 502 or 503"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "reliability", "errors", "gateway", "cross-service"]
summary: "A bad answer from sineva-ai becomes a 502 and an unreachable sineva-ai becomes a 503, both as typed domain errors in the standard error envelope."
related_docs:
  - "0008-no-silent-fallbacks.md"
  - "0013-internal-service-auth-header.md"
  - "0015-sineva-ai-owns-internal-chat-contract.md"
  - "../engineering/error_handling_and_failure_modes.md"
  - "../api-spec/agents_and_chat_endpoints.md"
adr_id: "0016"
decision_status: "Accepted"
supersedes: []
---

# ADR-0016: Upstream failures return 502 or 503

## Status

Accepted (2026-10-21).

Cross-service: mirrored in sineva-ai `docs/decisions/` (a sineva-ai ADR of the same title; that folder does not exist yet, so no number is cited). Change both repos together.

## Context

[ADR-0008](0008-no-silent-fallbacks.md) banned silent fallbacks, and the AI gateway fallback has been deleted. That leaves a question: what does the caller see when `sineva-ai` fails? Returning 500 hides whether the engine answered badly or was down, and the UI cannot decide whether a retry is worth offering.

## Decision

`InternalAiEngineGateway.dispatchAgentChat` throws one of two domain errors from `server/domain/errors/domain_error.ts`:

| Situation | Error | Status | Code |
| :--- | :--- | :--- | :--- |
| `sineva-ai` answered with a non-2xx status, a body that is not JSON, or a body that fails the Zod envelope check | `UpstreamServiceError` | 502 | `UPSTREAM_ERROR` |
| The request could not complete: network error, timeout or abort | `UpstreamUnavailableError` | 503 | `UPSTREAM_UNAVAILABLE` |

- `handleRouteError` turns any `DomainError` into the standard error envelope with the error's status ([ADR-0003](0003-snake-case-wire-contract.md)). Route handlers add nothing.
- Error messages are client-safe. The upstream status and body are logged server-side only. The log never includes the internal key (a contract test asserts this).
- The timeout is `AI_ENGINE_TIMEOUT_MS` (Current default 15000 in `getEnvConfig()`). The timer covers reading the body, not only the headers, because a model reply can stall after the headers arrive.
- No retry, no cached reply, no canned text. A failed call produces no reply.
- Any upstream 4xx is also a 502. The platform validates input before the call, so an upstream 4xx means the two services disagree about the contract, which is a server-side fault from the user's point of view.

## Consequences

- The dashboard (`client/components/sineva_dashboard.tsx`) renders no reply on failure and shows an error toast. For 502 and 503 the toast offers Retry, which re-sends the same prompt without duplicating the user message in the transcript.
- A wrong or missing `AI_ENGINE_INTERNAL_API_KEY` now surfaces as a 502 (`sineva-ai` answers 401), where before it produced a canned reply ([ADR-0013](0013-internal-service-auth-header.md)).
- An agent that exists in the platform registry but not in `sineva-ai` produces a 502, not a 404. The use case checks the platform registry first, so a 404 means the slug is unknown to the platform.
- Upstream 4xx bodies are logged truncated to 500 characters and may contain user text. Known debt.
- `checkHealth()` is outside this decision: it reports `is_reachable` and does not throw, and it returns a hardcoded `engine_version`. Known debt.
- No circuit breaker or rate limiting exists. Repeated failures cost one timeout each.

## Alternatives considered

- Map every upstream failure to 500. Rejected: it loses the difference between "answered badly" and "down", and the UI keys its retry on it.
- Retry automatically on 503. Not chosen: a retry doubles load on an engine that may already be overloaded, and the user can retry from the toast.
- Keep a degraded-mode reply. Rejected in [ADR-0008](0008-no-silent-fallbacks.md).
