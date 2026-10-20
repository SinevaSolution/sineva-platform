---
title: "Standardized API Response Pattern"
category: "engineering"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "response-pattern", "api-envelope", "pagination", "error-handling", "shared"]
summary: "Complete specification of the @sineva/shared API response envelope (success, status, message, data, meta, errors) and helper utilities."
related_docs:
  - "coding_standards.md"
  - "../api-spec/overview.md"
  - "design_pattern.md"
---

# Standardized API Response Pattern (`@sineva/shared`)

Every HTTP endpoint in `sineva-platform` (`/api/v1/*`) and `sineva-ai` (`http://sineva-ai:8000/api/v1/*`) MUST return a JSON payload wrapped in the standardized `ApiResponse<T>` envelope defined in [`packages/shared/src/response.ts`](../../packages/shared/src/response.ts).

---

## 1. Envelope Schema Specification

```typescript
export interface ResponseMeta {
  page?: number;
  per_page?: number;
  total_items?: number;
  total_pages?: number;
  has_next?: boolean;
  has_prev?: boolean;
  request_id: string;
  timestamp: string;
}

export interface PaginationMeta extends ResponseMeta {
  page: number;
  per_page: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ErrorDetail {
  code: string;
  field: string | null;
  detail: string;
}

export interface ApiResponse<T> {
  success: boolean;
  status: number;
  message: string;
  data: T | null;
  meta: ResponseMeta | null;
  errors: ErrorDetail[] | null;
}
```

### Top-Level Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` for 2xx responses; `false` for 4xx/5xx responses. |
| `status` | `number` | Numeric HTTP status code (`200`, `201`, `400`, `401`, `404`, `422`, `500`, etc.) mirrored in body for client convenience. |
| `message` | `string` | Human-readable summary of the operation result. |
| `data` | `T \| null` | The `snake_case` payload object or array on success; always `null` on error. |
| `meta` | `ResponseMeta \| null` | Always includes `request_id` (`req_<timestamp>_<random>`) and ISO-8601 `timestamp`. Includes pagination counters on paginated list endpoints. |
| `errors` | `ErrorDetail[] \| null` | `null` on success; non-empty array of structured `ErrorDetail` objects (`code`, `field`, `detail`) on failure. |

---

## 2. Helper Functions in `@sineva/shared`

### 2.1 `createSuccessResponse<T>(options)`
Used for single-resource reads (`200 OK`), resource creation (`201 Created`), or action invocations.

```json
{
  "success": true,
  "status": 200,
  "message": "Agent chat response generated successfully",
  "data": {
    "agent_slug": "sino-finance",
    "conversation_id": "conv_20261021_9f8a",
    "reply_markdown": "Q3 operating margin improved by **4.2%** due to lower cloud egress costs.",
    "tokens_used": 342
  },
  "meta": {
    "request_id": "req_1761001200000_x8k2m9p1",
    "timestamp": "2026-10-21T00:20:00.000Z"
  },
  "errors": null
}
```

### 2.2 `createPaginatedResponse<T>(options)`
Used for collection endpoints (`GET /api/v1/agents`). Automatically computes `total_pages`, `has_next`, and `has_prev` safely (clamping `page >= 1` and `per_page >= 1`).

```json
{
  "success": true,
  "status": 200,
  "message": "AI companions retrieved successfully",
  "data": [
    {
      "agent_id": "agt_01",
      "agent_slug": "sino-people",
      "display_name": "@SinoPeople",
      "department": "hr",
      "is_active": true
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 10,
    "total_items": 6,
    "total_pages": 1,
    "has_next": false,
    "has_prev": false,
    "request_id": "req_1761001200000_a1b2c3d4",
    "timestamp": "2026-10-21T00:20:00.000Z"
  },
  "errors": null
}
```

### 2.3 `createErrorResponse(options)`
Used for all `4xx` and `5xx` errors. Ensures `data` is `null` and `errors` contains at least one structured `ErrorDetail`.

```json
{
  "success": false,
  "status": 422,
  "message": "Validation failed for request payload",
  "data": null,
  "meta": {
    "request_id": "req_1761001200000_err9912a",
    "timestamp": "2026-10-21T00:20:00.000Z"
  },
  "errors": [
    {
      "code": "VALIDATION_ERROR",
      "field": "agent_slug",
      "detail": "Field 'agent_slug' must be a non-empty lowercase kebab-case slug"
    }
  ]
}
```

---

## 3. HTTP Status Code Mapping

| HTTP Status | Standard Error Code | When to Use |
| :--- | :--- | :--- |
| `200 OK` | — | Successful read (`GET`) or synchronous action (`POST /chat`, `POST /presign`). |
| `201 Created` | — | Resource created (`POST /api/v1/agents`). |
| `400 Bad Request` | `BAD_REQUEST` | Malformed JSON or non-`snake_case` payload keys. |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing or invalid authentication token. |
| `403 Forbidden` | `FORBIDDEN` | Insufficient permissions for the workspace/agent. |
| `404 Not Found` | `RESOURCE_NOT_FOUND` | Requested `agent_slug` or `conversation_id` does not exist. |
| `409 Conflict` | `RESOURCE_CONFLICT` | Duplicate `agent_slug` registration. |
| `422 Unprocessable Entity` | `VALIDATION_ERROR` | Field-level schema validation failure. |
| `502 Bad Gateway` | `UPSTREAM_AI_ENGINE_ERROR` | Internal `sineva-ai` engine returned an unexpected error. |
| `500 Internal Server Error` | `INTERNAL_SERVER_ERROR` | Unhandled server exception. |
