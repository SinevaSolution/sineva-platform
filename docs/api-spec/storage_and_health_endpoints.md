---
title: "Storage and Health Endpoints"
category: "api-spec"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "api-spec", "health", "storage", "seaweedfs", "s3", "presigned-url"]
summary: "POST /api/v1/storage/presign and GET /api/v1/health as implemented, including the unsigned URL returned on error and what the health route really checks."
related_docs:
  - "overview.md"
  - "agents_and_chat_endpoints.md"
  - "../decisions/0002-seaweedfs-presigned-uploads.md"
  - "../decisions/0008-no-silent-fallbacks.md"
  - "../troubleshooting/storage_db_and_redis.md"
  - "../development/known_issues_and_tech_debt.md"
---

# Storage and health endpoints

Source: `apps/web/src/app/api/v1/storage/presign/route.ts`, `apps/web/src/app/api/v1/health/route.ts`, `PresignStorageUploadUseCase`, `GetSystemHealthUseCase`, `SeaweedStorageRepository`. The envelope and errors are in [overview](overview.md).

"Current" is what the code does. "Target" is decided but not built.

## Gotchas first

- Current: when presigning throws, the route still answers 201 with an unsigned URL. The browser upload to that URL fails at S3. This breaks R-26 and is listed as debt.
- Current: `workspace_id` comes from the request body and is put into the object key unchanged. Without authentication, a caller can presign an upload into any workspace prefix.
- In the compose stack the platform signs against `S3_ENDPOINT=http://seaweedfs-s3:8333`, so `upload_url` carries a host name that only resolves inside the Docker network. A browser outside it cannot use that URL as returned. There is no separate public endpoint setting. Not tested end to end.
- `postgresql_prisma.status` is `healthy` when `DATABASE_URL` is set. Nothing pings Postgres.
- `redis_cache.status` is always `healthy`. The "Redis" cache is an in-memory `Map`, and `ping()` returns `true`.
- The health route returns 200 whatever the subsystem states are.

## `POST /api/v1/storage/presign`

Returns a presigned S3 `PUT` URL for a direct browser upload to SeaweedFS ([ADR-0002](../decisions/0002-seaweedfs-presigned-uploads.md)). Nothing is written to Postgres: the `storage_objects` table exists but no code fills it.

Body (`presignStorageDtoSchema`):

| Field | Type | Required | Constraint |
| :--- | :--- | :--- | :--- |
| `workspace_id` | string | yes | 2 to 128 characters. Not checked against any workspace. |
| `file_name` | string | yes | 1 to 255 characters |
| `content_type` | string | yes | 3 to 128 characters. No allow-list. |
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

- Object key: `workspaces/<workspace_id>/<Date.now()>_<file_name>`. In `file_name`, every character outside `a-z A-Z 0-9 . _ -` becomes `_`, then it is lowercased. `workspace_id` is not sanitized.
- The URL is built with `getSignedUrl` and a `PutObjectCommand` that sets `Bucket`, `Key`, `ContentType` and `ContentLength`. It expires after 900 seconds. Whether SeaweedFS enforces the signed content type and length on upload was not verified.
- Signing is a local computation. It needs no network call, so the error path below is rare in practice (for example a broken credential or endpoint configuration).

Success: 201, message `SeaweedFS S3 presigned upload URL generated successfully`. The example uses placeholder values; the signature parameters are shortened.

```json
{
  "success": true,
  "status": 201,
  "message": "SeaweedFS S3 presigned upload URL generated successfully",
  "data": {
    "object_key": "workspaces/wks_sineva_hq/1792547075000_q3_board_deck.pdf",
    "upload_url": "http://seaweedfs-s3:8333/sineva-assets/workspaces/wks_sineva_hq/1792547075000_q3_board_deck.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900&X-Amz-Signature=...",
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
| 422 | `VALIDATION_ERROR` | a field fails its constraint (for example `file_size_bytes` over 100 MiB) |
| 500 | `INTERNAL_SERVER_ERROR` | bad JSON |

Unsigned URL on error (Current, debt): if `getSignedUrl` throws, the repository catches everything and returns `upload_url: "<S3_ENDPOINT>/<bucket>/<object_key>?X-Amz-Expires=900"` with the same 201 envelope. Nothing in the response says the URL is unsigned. Target: let the failure surface as a typed error (a 5xx through `handleRouteError`) so the caller sees a failure, as the AI gateway does ([ADR-0008](../decisions/0008-no-silent-fallbacks.md)).

Not present: a download URL, required upload headers in the response, a bucket-exists check, a per-user quota.

## `GET /api/v1/health`

Reports four subsystems. No query, no body, no authentication.

Success: 200, message `Sineva platform and shared infrastructure health verified`. The example is a stack where every dependency answers.

```json
{
  "success": true,
  "status": 200,
  "message": "Sineva platform and shared infrastructure health verified",
  "data": {
    "service_name": "sineva-platform",
    "environment": "production",
    "uptime_seconds": 3842,
    "subsystems": {
      "postgresql_prisma": { "status": "healthy", "orm_driver": "@prisma/adapter-pg" },
      "redis_cache": { "status": "healthy", "client": "ioredis" },
      "seaweedfs_s3": { "status": "healthy", "bucket_name": "sineva-assets" },
      "sineva_ai_engine": {
        "status": "healthy",
        "internal_url": "http://sineva-ai:8000",
        "network_mode": "sineva_internal_bridge_only",
        "latency_ms": 12
      }
    }
  },
  "meta": { "request_id": "req_1792547075000_k3j9x2ab", "timestamp": "2026-10-21T01:44:35.000Z" },
  "errors": null
}
```

`status` is `healthy` or `standby`. There is no `unhealthy` or `degraded` value, so `standby` also means "failed".

What each status really checks (Current):

| Subsystem | `healthy` means | Real check |
| :--- | :--- | :--- |
| `postgresql_prisma` | `process.env.DATABASE_URL` is set | None. No query is sent. |
| `redis_cache` | `CacheRepository.ping()` returned true | None. The adapter is an in-memory `Map` and `ping()` always returns `true`. The `client: "ioredis"` label is a string constant: no ioredis client is created. |
| `seaweedfs_s3` | `S3_ENDPOINT` is non-empty | None. `checkHealth()` returns `Boolean(endpoint)`, and `getEnvConfig()` has a default endpoint, so it is always true. |
| `sineva_ai_engine` | `GET {AI_ENGINE_INTERNAL_URL}/api/v1/health` answered 2xx within 1200 ms | Real HTTP call with `X-Internal-Api-Key`. `latency_ms` is at least 1. |

Consequences:

- A stopped Postgres, Redis or SeaweedFS does not change the health response. Only `sineva_ai_engine` can show `standby` for a real reason.
- The route cannot return a non-200 status in normal operation: the use case does not throw, and the AI gateway swallows its own failures.
- The response exposes the `sineva-ai` internal URL and the bucket name to any caller. Target: restrict detail to authenticated callers and keep a minimal public probe.
- `InternalAiEngineGateway.checkHealth()` also computes an `engine_version` (hardcoded `1.0.0`, or `1.0.0-standby` on failure). The use case drops it, so the response never shows it.

Errors: 500 only if something throws while building the use case. Target: real Postgres (`SELECT 1`), Redis (`PING`) and S3 (`HeadBucket`) probes with short timeouts, and a non-200 status when a required dependency is down (see the [roadmap](../development/roadmap.md)).

## Related

[Overview](overview.md), [agents and chat endpoints](agents_and_chat_endpoints.md), [storage, database and Redis troubleshooting](../troubleshooting/storage_db_and_redis.md), [known issues and tech debt](../development/known_issues_and_tech_debt.md).
