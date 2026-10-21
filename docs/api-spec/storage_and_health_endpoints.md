---
title: "Storage and Health Endpoints"
category: "api-spec"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "api-spec", "health", "storage", "seaweedfs", "s3", "presigned-url"]
summary: "POST /api/v1/storage/presign and GET /api/v1/health specification, including truthful dependency health probes and typed 502 errors."
related_docs:
  - "overview.md"
  - "agents_and_chat_endpoints.md"
  - "swagger_and_openapi.md"
  - "../development/known_issues_and_tech_debt.md"
  - "../decisions/0002-seaweedfs-presigned-uploads.md"
  - "../decisions/0008-no-silent-fallbacks.md"
---

# Storage and health endpoints

Source: `apps/web/src/app/api/v1/storage/presign/route.ts`, `apps/web/src/app/api/v1/health/route.ts`, `PresignStorageUploadUseCase`, `GetSystemHealthUseCase`, `SeaweedStorageRepository`. The envelope and errors are in [overview](overview.md).

## Baseline behavior

- Presigning fails fast with a typed 502 `UpstreamServiceError` (`model_unavailable`) when signing fails; it never fabricates an unsigned fallback URL (R-26, [ADR-0008](../decisions/0008-no-silent-fallbacks.md)).
- Presigned URL host is configured by `S3_PUBLIC_ENDPOINT` (default `http://localhost:8333`), ensuring browsers outside Docker can reach the upload endpoint directly.
- `workspace_id` currently comes from the request body. Once authentication exists (WP-M0-22), it is derived from the server session and validated as a UUID before placement into storage keys (SEC-3).
- Real health probes execute on every `/api/v1/health` call: Postgres (`SELECT 1`), Redis (`PING`), S3 (`HeadBucketCommand`), and `sineva-ai` (`GET /api/v1/health`).
- When any required subsystem fails, the route responds with HTTP 503 (`code: 'dependency_unavailable'`) and status `standby`.
- For public / unauthenticated callers, `/api/v1/health` returns status only (`{ status: "healthy" | "standby" }`), concealing internal network addresses, bucket names, and subsystems (SEC-7).

## `POST /api/v1/storage/presign`

Returns a presigned S3 `PUT` URL for a direct browser upload to SeaweedFS ([ADR-0002](../decisions/0002-seaweedfs-presigned-uploads.md)). Nothing is written to Postgres: the `storage_objects` table exists but no code fills it.

Body (`presignStorageDtoSchema`):

| Field | Type | Required | Constraint |
| :--- | :--- | :--- | :--- |
| `workspace_id` | string | yes | 2 to 128 characters. Not checked against any workspace yet. |
| `file_name` | string | yes | 1 to 255 characters |
| `content_type` | string | yes | 3 to 128 characters. |
| `file_size_bytes` | integer | yes | positive, at most 104857600 (100 MiB) |

```json
{
  "workspace_id": "wks_sineva_hq",
  "file_name": "q3_board_deck.pdf",
  "content_type": "application/pdf",
  "file_size_bytes": 2048576
}
```

Behavior (`SeaweedStorageRepository.createPresignedUploadUrl`):

- Object key: `workspaces/<workspace_id>/<Date.now()>_<file_name>`. In `file_name`, every character outside `a-z A-Z 0-9 . _ -` becomes `_`, then it is lowercased.
- The URL is built with `getSignedUrl` and a `PutObjectCommand` that sets `Bucket`, `Key`, `ContentType` and `ContentLength`. It expires after 900 seconds.
- The presigned URL host uses `S3_PUBLIC_ENDPOINT`.

Success: 201, message `SeaweedFS S3 presigned upload URL generated successfully`.

```json
{
  "success": true,
  "status": 201,
  "message": "SeaweedFS S3 presigned upload URL generated successfully",
  "data": {
    "object_key": "workspaces/wks_sineva_hq/1792547075000_q3_board_deck.pdf",
    "upload_url": "http://localhost:8333/sineva-assets/workspaces/wks_sineva_hq/1792547075000_q3_board_deck.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900&X-Amz-Signature=...",
    "bucket_name": "sineva-assets",
    "expires_in_seconds": 900,
    "storage_provider": "seaweedfs_s3"
  },
  "meta": { "request_id": "req_1792547075000_k3j9x2ab", "timestamp": "2026-10-21T01:44:35.000Z" },
  "errors": null
}
```

Errors:

| Status | Code | When |
| :--- | :--- | :--- |
| 422 | `validation_failed` | empty or invalid JSON, or field fails its constraint |
| 502 | `model_unavailable` | S3 signing failure (`UpstreamServiceError`); never returns an unsigned URL |
| 500 | `internal_error` | unexpected server error |

## `GET /api/v1/health`

Inspects real infrastructure readiness. No query parameters, no body required.

Public Success (all dependencies healthy): HTTP 200

```json
{
  "success": true,
  "status": 200,
  "message": "Sineva platform and shared infrastructure health verified",
  "data": {
    "status": "healthy"
  },
  "meta": {
    "request_id": "9cc54e07-7d44-4a7c-885e-d5c8b487f068",
    "timestamp": "2026-10-21T12:00:00.000Z"
  },
  "errors": null
}
```

Public Degraded (one or more dependencies failed): HTTP 503

```json
{
  "success": false,
  "status": 503,
  "code": "dependency_unavailable",
  "message": "One or more required infrastructure subsystems are in standby or unavailable",
  "data": {
    "status": "standby"
  },
  "meta": {
    "request_id": "9cc54e07-7d44-4a7c-885e-d5c8b487f068",
    "timestamp": "2026-10-21T12:00:00.000Z"
  },
  "errors": [
    {
      "code": "dependency_unavailable",
      "field": null,
      "detail": "System health probe detected degraded subsystem status"
    }
  ]
}
```

Real dependency checks:

| Subsystem | `healthy` means | Real probe |
| :--- | :--- | :--- |
| `postgresql_prisma` | Postgres connection and query succeed | Real `SELECT 1` query via `@prisma/adapter-pg` with 2000 ms timeout |
| `redis_cache` | Redis server answers `PONG` | Real `PING` command via `ioredis` with 1500 ms timeout and no offline queuing |
| `seaweedfs_s3` | SeaweedFS S3 bucket exists and is accessible | Real `HeadBucketCommand` via `@aws-sdk/client-s3` with 1500 ms timeout |
| `sineva_ai_engine` | `sineva-ai` liveness endpoint answers 2xx | Real HTTP call with `X-Internal-Api-Key` and timeout; extracts real `version` from body |

## Related

[Overview](overview.md), [agents and chat endpoints](agents_and_chat_endpoints.md), [storage, database and Redis troubleshooting](../troubleshooting/storage_db_and_redis.md), [known issues and tech debt](../development/known_issues_and_tech_debt.md).
