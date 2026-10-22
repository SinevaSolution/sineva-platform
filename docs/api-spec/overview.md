---
title: "API Overview"
category: "api-spec"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "api-spec", "rest", "envelope", "errors", "snake-case", "bff"]
summary: "The five HTTP routes of sineva-platform, the shared response envelope, how request ids and timestamps are produced, every error code, and what the API does not have yet."
related_docs:
  - "README.md"
  - "agents_and_chat_endpoints.md"
  - "storage_and_health_endpoints.md"
  - "swagger_and_openapi.md"
  - "../engineering/response_pattern.md"
  - "../engineering/error_handling_and_failure_modes.md"
  - "../decisions/0003-snake-case-wire-contract.md"
---

# API overview

`sineva-platform` is the only public entry point of the suite ([ADR-0001](../decisions/0001-bff-gateway.md)). Its HTTP API is five Next.js route handlers in `apps/web/src/app/api`. Each handler does three things: parse input with Zod, call a use case from `@/server/container`, answer through `server/http/response_helper`. Responses use the envelope from `@sineva/shared` (`packages/shared/src/response.ts`).

"Current" is what the code does. "Target" is decided but not built.

## Gotchas first

- Current: there is no authentication or authorization on any route. `user_id` and `workspace_id` come from the request body. Anyone who can reach the port can register an agent, chat as any user, and presign an upload into any workspace prefix.
- A malformed or empty JSON body returns 422 `validation_failed` (`parseJsonBody` in `response_helper`). Handlers must not call `request.json()` directly.
- A 500 carries a fixed message and the `request_id`. The cause is logged server-side with that id and never sent to the client. Upstream (`sineva-ai`) error text is never forwarded either: 502 and 503 messages are fixed.
- Unknown keys in a request body are silently dropped (Zod `z.object` strips them). A misspelled optional field is ignored, not rejected.
- `meta.request_id` is the request's `X-Request-Id` when the caller sent a safe one (8 to 128 characters of `A-Za-z0-9._-`), otherwise a generated UUID. It is returned as the `X-Request-Id` response header and forwarded to `sineva-ai`.
- The health route returns 200 even when every subsystem is `standby`.

## Entry points

| Item | Value |
| :--- | :--- |
| Base path | `/api/v1` (path versioning) |
| Local host and port | `http://localhost:3000` (`next dev` and the compose service both use 3000) |
| OpenAPI document | `GET /api/openapi.json` |
| Docs page | `/api-docs` (a static view, see [swagger and OpenAPI](swagger_and_openapi.md)) |
| Production host | Not documented in this repository. The OpenAPI `servers` list only has the local URL. |

## Route inventory

| Method | Path | Handler | Use case | Success | Error statuses |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | `app/api/v1/health/route.ts` | `GetSystemHealthUseCase` | 200 | 503, 500 |
| `GET` | `/api/v1/workspaces/{workspace_id}/agents` | `app/api/v1/workspaces/[workspace_id]/agents/route.ts` | `ListWorkspaceSpecialistsUseCase` | 200 | 401, 404, 422, 502, 503, 500 |
| `POST` | `/api/v1/agents/{agent_slug}/chat` | `app/api/v1/agents/[agent_slug]/chat/route.ts` | `SendAgentMessageUseCase` | 200 | 404, 422, 500, 502, 503 |
| `POST` | `/api/v1/storage/presign` | `app/api/v1/storage/presign/route.ts` | `PresignStorageUploadUseCase` | 201 | 422, 502, 500 |
| `GET` | `/api/openapi.json` | `app/api/openapi.json/route.ts` | none (static) | 200 | none |
| `POST` | `/internal/v1/audit-events` (alias `/api/internal/v1/audit-events`) | `app/internal/v1/audit-events/route.ts` | `IngestAuditEventUseCase` | 201 | 401, 404, 422, 500 |

This table is not complete (the auth, workspace and conversation routes are listed in the OpenAPI document; the profile family is in [profile and preferences](profile_and_preferences_endpoints.md)). The audit ingest route is internal: `X-Internal-Api-Key` only, `actor_type` limited to `specialist` or `system`, a `workspace_id` must exist, and sensitive metadata keys are redacted. Every route that changes state is listed in `server/http/route_policy.ts` with the audit events it emits (or a reasoned `none`) and, for create and run paths, its entitlement key; `route_policy_inventory.test.ts` fails when a mutating route is missing there.

`/api/v1/workspaces/{workspace_id}/agents` keeps the word "agent" in the path, the JSON keys and the types. User-facing copy says "companion" and "product" ([ADR-0011](../decisions/0011-user-facing-wording.md), [product model](../product/product_model_and_wording.md)).

## The envelope

Every route except `/api/openapi.json` answers with `ApiResponse<T>`:

```ts
interface ApiResponse<T> {
  success: boolean;
  status: number;            // same number as the HTTP status
  message: string;
  code?: string;             // stable machine error code (FR-UX-31)
  data: T | null;            // null on errors
  meta: ResponseMeta | null; // always an object today
  errors: ErrorDetail[] | null; // null on success
}
interface ErrorDetail { code: string; field: string | null; detail: string }
```

Three constructors build it: `createSuccessResponse`, `createPaginatedResponse`, `createErrorResponse`. Handlers never build it by hand (R-24); they call `sendSuccessJson`, `sendPaginatedJson` or `handleRouteError` from `server/http/response_helper.ts`.

Success:

```json
{
  "success": true,
  "status": 200,
  "message": "Sineva platform and shared infrastructure health verified",
  "data": {},
  "meta": { "request_id": "req_1792547075000_k3j9x2ab", "timestamp": "2026-10-21T01:44:35.000Z" },
  "errors": null
}
```

Paginated routes add to `meta`: `page`, `per_page`, `total_items`, `total_pages`, `has_next`, `has_prev`. `total_pages` is at least 1, even for an empty list, so an empty result has `total_pages: 1` and `has_next: false`.

Error:

```json
{
  "success": false,
  "status": 404,
  "message": "Agent 'unknown-companion' was not found",
  "data": null,
  "meta": { "request_id": "req_1792547075000_k3j9x2ab", "timestamp": "2026-10-21T01:44:35.000Z" },
  "errors": [{ "code": "RESOURCE_NOT_FOUND", "field": null, "detail": "Agent 'unknown-companion' was not found" }]
}
```

### Request id and timestamp

- `request_id` is a UUID generated via `crypto.randomUUID()` (or accepted from `X-Request-Id`).
- `timestamp` is `new Date().toISOString()` at the moment the envelope is built (UTC, millisecond precision).
- Handlers accept an incoming `X-Request-Id` request header, echo it in the `X-Request-Id` response header, and forward it to `sineva-ai` to ensure single-trace end-to-end observability (API-5).

## Errors

`handleRouteError` maps what a handler throws:

| Thrown | Status | `code` | `errors[].code` | `message` |
| :--- | :--- | :--- | :--- | :--- |
| `MalformedJsonError` | 422 | `validation_failed` | `validation_failed` | `Request payload validation failed` |
| `ZodError` | 422 | `validation_failed` | `validation_failed` | `Request payload validation failed` |
| `NotFoundError` | 404 | `not_found` | `RESOURCE_NOT_FOUND` | `<Resource> '<id>' was not found` |
| `ConflictError` | 409 | `conflict` | `RESOURCE_CONFLICT` | `<Resource> '<id>' already exists` |
| `UpstreamServiceError` | 502 | `model_unavailable` | `UPSTREAM_ERROR` | `The AI engine returned an unexpected response` |
| `UpstreamUnavailableError` | 503 | `dependency_unavailable` | `UPSTREAM_UNAVAILABLE` | `The AI engine is unavailable` |
| any other `DomainError` | its own `status` | mapped code | its own `code` | its own message |
| anything else | 500 | `internal_error` | `internal_error` | `Internal server error` (cause logged server-side with request_id, never leaked to client) |

- Validation: `errors[].field` is the Zod path joined with `.` (for example `capabilities.0`), or `null` for a root-level problem. `detail` is Zod's default message text, which can change when Zod is upgraded. Clients should key on `code` and `field`, not on `detail`.
- 502 and 503 messages are fixed and client-safe. The upstream status and body go to the server log only ([ADR-0016](../decisions/0016-upstream-failures-return-502-503.md)).
- Check order in the chat route: JSON parse (500 on bad JSON), Zod validation (422), agent lookup (404), then the upstream call (502 or 503). A bad body for an unknown slug returns 422, not 404.
- Current gap: the 500 branch should return a fixed message and log the cause. It is listed in [known issues and tech debt](../development/known_issues_and_tech_debt.md).

## Conventions

- `snake_case` for every JSON key, query parameter, path parameter and `meta` field (R-23, [ADR-0003](../decisions/0003-snake-case-wire-contract.md)). `assertSnakeCaseKeys` in `@sineva/shared` checks one level of keys and is only used by the tests in `packages/shared`; no route test calls it today, so the convention is held by review and by the typed views. Free-form maps such as `context_metadata`, `token_usage` and `tool_calls[].arguments` hold whatever keys the caller or `sineva-ai` put in them.
- Timestamps are ISO 8601 strings. Agent ids are UUIDs generated by the database ([ADR-0014](../decisions/0014-uuid-primary-keys.md)).
- Pagination: `page` (from 1) and `per_page` (1 to 100, default 10) in the query.
- Content type: `application/json` in and out. The handlers do not check the request `Content-Type`; they read the body through `parseJsonBody`.

## What the API does not have yet

| Missing | Effect today |
| :--- | :--- |
| Authentication and authorization | Every route is open. Identity is whatever the body says (R-27). |
| Rate limiting | None. Repeated chat failures cost one upstream timeout each. |
| CORS configuration | None in code. Browsers can only call the API from the same origin. |
| Idempotency keys | A retried chat turn can run twice. See the retry note in [agents and chat endpoints](agents_and_chat_endpoints.md). |
| Deprecation policy | Only the `/v1` prefix and `info.version` `1.0.0` in the OpenAPI document. No policy is written down. |
| Request body size limit beyond field limits | Field maximums apply after the body is read. |

## Related

[Agents and chat endpoints](agents_and_chat_endpoints.md), [storage and health endpoints](storage_and_health_endpoints.md), [swagger and OpenAPI](swagger_and_openapi.md), [response pattern](../engineering/response_pattern.md), [known issues and tech debt](../development/known_issues_and_tech_debt.md).
