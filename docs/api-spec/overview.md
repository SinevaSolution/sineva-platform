---
title: "REST API Overview & Contracts"
category: "api-spec"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "api-spec", "rest", "snake-case", "bff", "versioning"]
summary: "Overview of the sineva-platform public RESTful API (/api/v1/*), strict snake_case request/response contract, headers, and BFF gateway routing."
related_docs:
  - "../engineering/response_pattern.md"
  - "swagger_and_openapi.md"
  - "agents_and_chat_endpoints.md"
  - "storage_and_health_endpoints.md"
---

# REST API Overview & Contracts

`sineva-platform` exposes a versioned RESTful API under `/api/v1/*` implemented via Next.js App Router Route Handlers (`apps/web/src/app/api/v1/`). It serves both the React/Redux web client and authorized external integrations while acting as the BFF gateway to the isolated `sineva-ai` microservice.

---

## 1. Base URLs & Versioning

| Environment | Public Base URL | OpenAPI Spec JSON | Interactive Swagger UI |
| :--- | :--- | :--- | :--- |
| **Local Development / Docker** | `http://localhost:3000/api/v1` | `http://localhost:3000/api/openapi.json` | `http://localhost:3000/api-docs` |
| **Production** | `https://app.sineva.ai/api/v1` | `https://app.sineva.ai/api/openapi.json` | `https://app.sineva.ai/api-docs` |

---

## 2. Core Contract Rules

1. **Strict `snake_case` Wire Protocol**:
   - Every query parameter (`?page=1&per_page=10&is_active=true`), path parameter (`{agent_slug}`), JSON request body key (`conversation_id`, `file_name`, `content_type`), and JSON response key (`request_id`, `total_items`, `reply_markdown`) MUST be `snake_case`.
   - Requests containing non-`snake_case` top-level or nested keys are rejected with `400 Bad Request` (`INVALID_KEY_CONVENTION`) or normalized at the boundary.
2. **Standardized Envelope (`ApiResponse<T>`)**:
   - All responses return `success`, `status`, `message`, `data`, `meta`, and `errors` via `@sineva/shared`.
3. **Request Tracing (`X-Request-Id`)**:
   - Clients may pass an optional `X-Request-Id` header. If omitted, the platform generates a deterministic `req_<timestamp>_<random>` identifier, echoes it in `meta.request_id`, and forwards it to `sineva-ai`.

---

## 3. Endpoint Summary Matrix

| Method | Path | Use Case | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | `CheckSystemHealthUseCase` | Platform, database, Redis, S3, and internal `sineva-ai` connectivity health check. |
| `GET` | `/api/v1/agents` | `ListAgentsUseCase` | Paginated list of Sineva AI companions (`@SinoPeople`..`@SinoInsights`) with department filtering. |
| `POST` | `/api/v1/agents` | `CreateAgentUseCase` | Register a new specialized AI companion in the workspace catalog. |
| `POST` | `/api/v1/agents/{agent_slug}/chat` | `ChatWithAgentUseCase` | Dispatch a user prompt to a specific companion via the internal `sineva-ai` engine. |
| `POST` | `/api/v1/storage/presign` | `GeneratePresignedUploadUseCase` | Generate a SeaweedFS S3 presigned upload (`PUT`) and download (`GET`) ticket. |
| `GET` | `/api/openapi.json` | OpenAPI Generator | Complete OpenAPI 3.1.0 machine-readable specification. |
