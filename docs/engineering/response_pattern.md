---
title: "API Response Pattern"
category: "engineering"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "response-pattern", "api-envelope", "pagination", "response-helper", "shared"]
summary: "The ApiResponse envelope from @sineva/shared, the three response_helper functions route handlers use, the status codes the code actually produces, and the gaps."
related_docs:
  - "coding_standards.md"
  - "error_handling_and_failure_modes.md"
  - "../api-spec/overview.md"
  - "../api-spec/agents_and_chat_endpoints.md"
  - "../governance/agent_rules.md"
  - "../decisions/0003-snake-case-wire-contract.md"
---

# API Response Pattern

Rules: R-23 and R-24 in [agent rules](../governance/agent_rules.md). Decision: [ADR-0003](../decisions/0003-snake-case-wire-contract.md). Every `/api/v1/*` response uses one envelope, built by `@sineva/shared` and sent through `apps/web/src/server/http/response_helper.ts`. The one exception is `GET /api/openapi.json`, which returns the raw OpenAPI document.

## 1. Envelope

Defined in `packages/shared/src/response.ts`:

```typescript
export interface ApiResponse<T> {
  success: boolean;
  status: number;
  message: string;
  data: T | null;
  meta: ResponseMeta | null;
  errors: ErrorDetail[] | null;
}

export interface ErrorDetail {
  code: string;
  field: string | null;
  detail: string;
}
```

| Field | Success | Error |
| :--- | :--- | :--- |
| `success` | `true` | `false` |
| `status` | The HTTP status, repeated in the body | Same |
| `message` | Set by the route (default "Operation completed successfully") | The error message |
| `data` | The payload (an array for lists) | `null` |
| `meta` | `request_id` and `timestamp`; plus `page`, `per_page`, `total_items`, `total_pages`, `has_next`, `has_prev` on lists | `request_id` and `timestamp` |
| `errors` | `null` | At least one `ErrorDetail` |

`request_id` is `req_<Date.now()>_<8 random base36 chars>`, made by `generateRequestId`. It is not read from an incoming header, so it cannot be correlated with a caller's id.

## 2. Building responses

Route handlers never call `NextResponse.json` themselves. They use three functions from `@/server/http/response_helper`:

| Function | Use | Wraps |
| :--- | :--- | :--- |
| `sendSuccessJson({ data, message, status })` | Single resource or action result | `createSuccessResponse` |
| `sendPaginatedJson({ items, page, per_page, total_items, message })` | Lists | `createPaginatedResponse` |
| `handleRouteError(error)` | The `catch` of every handler | `createErrorResponse` |

`createPaginatedResponse` clamps `page` and `per_page` to at least 1 and computes `total_pages`, `has_next` and `has_prev`. `createErrorResponse` adds a default `INTERNAL_SERVER_ERROR` detail when `errors` is empty.

Shape of every handler (see the full path in [clean architecture layers](../project-structure/clean_architecture_layers.md)):

```typescript
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const input = someDtoSchema.parse(body);
    const data = await getSomeUseCase().execute(input);
    return sendSuccessJson({ data, message: '...', status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

## 3. Examples

Chat reply (`POST /api/v1/agents/{agent_slug}/chat`, status 200). `data` mirrors sineva-ai's response fields plus `latency_ms` ([ADR-0015](../decisions/0015-sineva-ai-owns-internal-chat-contract.md)). Values here are placeholders:

```json
{
  "success": true,
  "status": 200,
  "message": "Agent companion message processed successfully",
  "data": {
    "message_id": "<uuid>",
    "session_id": "<uuid>",
    "agent_slug": "sinofinance",
    "display_name": "SinoFinance",
    "handle": "@SinoFinance",
    "routed_agent_slug": "sinofinance",
    "reply_content": "<text produced by sineva-ai>",
    "model_id": "<model id>",
    "execution_mode": "<mode>",
    "token_usage": { "total_tokens": 0 },
    "tool_calls": [],
    "citations": [],
    "created_at": "<ISO 8601>",
    "latency_ms": 0
  },
  "meta": { "request_id": "req_<ms>_<random>", "timestamp": "<ISO 8601>" },
  "errors": null
}
```

Validation failure (any route, status 422):

```json
{
  "success": false,
  "status": 422,
  "message": "Request payload validation failed",
  "data": null,
  "meta": { "request_id": "req_<ms>_<random>", "timestamp": "<ISO 8601>" },
  "errors": [
    { "code": "VALIDATION_ERROR", "field": "message_text", "detail": "message_text is required" }
  ]
}
```

Endpoint-by-endpoint payloads are in [api-spec](../api-spec/agents_and_chat_endpoints.md).

## 4. Status codes the code produces

| Status | `errors[].code` | Source |
| :--- | :--- | :--- |
| 200 | none | `sendSuccessJson` default, `sendPaginatedJson`, chat, health |
| 201 | none | `POST /api/v1/storage/presign` |
| 404 | `RESOURCE_NOT_FOUND` | `NotFoundError` (unknown `agent_slug` on chat) |
| 409 | `RESOURCE_CONFLICT` | `ConflictError` (for example a taken workspace slug) |
| 422 | `VALIDATION_ERROR` | `ZodError`, or `ValidationError` |
| 502 | `UPSTREAM_ERROR` | `UpstreamServiceError` |
| 503 | `UPSTREAM_UNAVAILABLE` | `UpstreamUnavailableError` |
| 500 | `INTERNAL_SERVER_ERROR` | Any other thrown value |

The mapping logic and logging are in [error handling and failure modes](error_handling_and_failure_modes.md). 400, 401 and 403 are not produced anywhere: there is no authentication, and a request body that is not valid JSON makes `request.json()` throw a `SyntaxError`, which `handleRouteError` turns into a 500 (not a 4xx).

## 5. Rules

- Keys are `snake_case` in `data`, `meta` and `errors` (R-23). `assertSnakeCaseKeys` from `@sineva/shared` checks only the top-level keys of the object you pass. It is used in `packages/shared/src/response.test.ts`; the route tests in `apps/web` do not call it today, so a new route test that cares about key casing has to add the call.
- Do not hand-build the envelope (R-24). `grep -rn "NextResponse.json" apps/web/src/app` should show only the OpenAPI route.
- New routes are registered in `server/infrastructure/openapi/spec.ts` (R-25).
- A new payload shape that the browser reads gets a view type in `src/shared` and a guard in `server/http` (R-14).
