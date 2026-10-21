---
title: "Error Handling and Failure Modes"
category: "engineering"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "errors", "domain-errors", "failure-modes", "logging", "no-silent-fallbacks"]
summary: "How a failure travels from an adapter to an HTTP response, the DomainError to status table, what is logged, the no-silent-fallback rule with forbidden patterns, and the fallbacks that still exist."
related_docs:
  - "response_pattern.md"
  - "design_pattern.md"
  - "../project-structure/clean_architecture_layers.md"
  - "../project-structure/frontend_architecture.md"
  - "../governance/agent_rules.md"
  - "../decisions/0008-no-silent-fallbacks.md"
  - "../decisions/0016-upstream-failures-return-502-503.md"
  - "../development/known_issues_and_tech_debt.md"
---

# Error Handling and Failure Modes

Rules: R-26 (no hidden failures) and R-41 (upstream failures are typed 502 or 503) in [agent rules](../governance/agent_rules.md). Decisions: [ADR-0008](../decisions/0008-no-silent-fallbacks.md), [ADR-0016](../decisions/0016-upstream-failures-return-502-503.md). "Current" is what the code does today.

## 1. The path of a failure

1. An adapter in `server/infrastructure` hits a problem and throws a subclass of `DomainError` (`server/domain/errors/domain_error.ts`).
2. Use cases let it pass, or throw their own (`SendAgentMessageUseCase` throws `NotFoundError`).
3. The route handler's `catch` calls `handleRouteError` (`server/http/response_helper.ts`), which picks the status and builds the standard envelope ([response pattern](response_pattern.md)).
4. The browser shows an error state ([frontend architecture](../project-structure/frontend_architecture.md)).

## 2. DomainError to HTTP

| Thrown | `errors[].code` | Status | Thrown by today |
| :--- | :--- | :--- | :--- |
| `NotFoundError(resource, id)` | `RESOURCE_NOT_FOUND` | 404 | `SendAgentMessageUseCase` (unknown `agent_slug`) |
| `ConflictError(resource, id)` | `RESOURCE_CONFLICT` | 409 | `PrismaAgentRepository.create` on a unique violation (`P2002`) |
| `ValidationError(message, details)` | `VALIDATION_ERROR` | 422 | Defined, not thrown anywhere yet |
| `ZodError` (not a `DomainError`) | `VALIDATION_ERROR` per issue | 422 | DTO `parse` in route handlers |
| `UpstreamServiceError` | `UPSTREAM_ERROR` | 502 | `InternalAiEngineGateway`: sineva-ai answered non-2xx, sent a non-JSON body, or sent a body that fails the Zod envelope check |
| `UpstreamUnavailableError` | `UPSTREAM_UNAVAILABLE` | 503 | `InternalAiEngineGateway`: network error, timeout or abort |
| `DomainError` (base) | its own `code` | its own `status`, default 400 | Nothing throws the base class directly |
| Anything else | `INTERNAL_SERVER_ERROR` | 500 | `handleRouteError` fallthrough |

`handleRouteError` checks in this order: `ZodError`, then `DomainError`, then everything else. Upstream error messages are client-safe on purpose ("The AI engine returned an unexpected response", "The AI engine is unavailable"). The upstream status and body stay in the server log.

## 3. What gets logged

Only the AI gateway logs, with `console.error` and a `[ai-engine]` prefix:

| Event | Fields logged |
| :--- | :--- |
| Request failed (network, timeout, abort) | `url`, `reason` (the error name), `aborted` |
| Non-2xx answer | `url`, `status`, `byte_length`, `code` (only when it is a machine token) |
| Non-JSON body | `url`, `status`, `byte_length` |
| Envelope failed validation | `url`, `status`, `issues` (path and message per issue) |

Not logged:

- Upstream response bodies. The gateway never logs them and never copies upstream error text into a thrown error, because those messages reach the client.
- A 404, 409 or 422 is not logged (they are caller errors, so this is fine).
- Request or response content anywhere. `handleRouteError` logs the cause of an unexpected error with the `request_id` (`[server-error] request_id=...`), so a user-reported id can be traced.

Gotchas:

- The cause of a 500 is logged with the `request_id` and may contain driver or ORM text. Treat server logs as sensitive. The response carries a fixed message and the same `request_id`.
- A request body that is empty or not valid JSON is a 422 `validation_failed` (`parseJsonBody` throws `MalformedJsonError`). Handlers must not call `request.json()` directly.
- A client `X-Request-Id` is trusted only when it is 8 to 128 characters of `A-Za-z0-9._-`; otherwise a UUID is generated.

## 4. No silent fallbacks

A failing dependency must look failing. The reply a user reads, the health value an operator reads and the config a service runs on are all real or an error.

Do:

```typescript
// Translate a known failure into a typed error; rethrow what you do not understand.
try {
  const row = await this.db.agentConfig.create({ data });
  return toEntity(row);
} catch (error) {
  if (isUniqueViolation(error)) {
    throw new ConflictError('Agent', input.agent_slug);
  }
  throw error;
}
```

Forbidden patterns, each with where it shows up today:

| Pattern | Why it is wrong | Example in the code |
| :--- | :--- | :--- |
| Empty `catch`, or a `catch` that returns a default | The caller cannot tell success from failure | Removed: presigning used to return an unsigned URL when signing threw. Now it is a 502 |
| Invented values in place of a measurement | A made-up number reads as data | Removed: `engine_version` used to be a constant. Now it comes from the engine's health body |
| A health check that does not check | An outage reports healthy | Removed: health values used to come from configuration. Now `SELECT 1`, Redis `PING`, S3 `HeadBucket` and the engine call decide |
| Filling a missing upstream field with a default | A contract break becomes silent bad data | Removed: the gateway used to default token counts and text. Now a missing field fails the Zod check and raises 502 |
| Canned reply text when the AI call fails | The user reads fiction as an answer | Removed from the gateway. Must not return in the UI either |
| Swallowing in the UI (`catch {}` then rendering something) | Same, in the browser | The chat UI shows a toast and renders nothing ([section 6](#6-ui-behavior)) |
| Hardcoded credential or URL used when an env var is missing | The service runs misconfigured, possibly against the wrong target | `getEnvConfig()` in `server/infrastructure/config/env.ts` |

Acceptable degradation: a health check may report `is_reachable: false` after catching a failed probe, because that is the measured result. It must not add detail it did not measure.

## 5. Remaining debt

These break R-26 or its neighbours. Do not copy them. Removing one needs a failing test first and, where the user sees it, a UI error state.

- `getEnvConfig()` has hardcoded default secrets and hosts (database URL and password, S3 keys, the internal API key). `docker-compose.yml` has defaults too.
- `AI_ENGINE_TIMEOUT_MS` is parsed with `Number(process.env.AI_ENGINE_TIMEOUT_MS ?? '15000')`. A non-numeric value gives `NaN`, and Node's `setTimeout` then fires after about 1 ms, so every chat call would abort and return 503.
- `DomainError` carries an HTTP `status` and imports a type from `@sineva/shared`, so the domain knows about HTTP.

## 6. UI behavior

The chat UI shows an error toast for any failed call and appends nothing to the transcript. For 502 and 503 the toast offers Retry. Details and gotchas: [frontend architecture, section 5](../project-structure/frontend_architecture.md#5-chat-ui-and-upstream-failures).

## 7. Adding a new failure type

1. Write the failing test first: the adapter test (or a contract test) for the failure, and a route test for the status and `errors[0].code`.
2. Add a `DomainError` subclass with a stable `code`, the right `status` and a client-safe message.
3. Throw it from the adapter. Log the diagnostic detail server-side, without secrets or user text.
4. Document the status in the route's OpenAPI entry (`server/infrastructure/openapi/spec.ts`).
5. Handle it in the UI with a visible state.
6. Update the table in section 2 and [response pattern](response_pattern.md).
