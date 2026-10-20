---
title: "Storage & Health Endpoints Specification"
category: "api-spec"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "api-spec", "health", "storage", "seaweedfs", "s3", "presigned-url"]
summary: "Endpoint specifications for GET /api/v1/health and POST /api/v1/storage/presign (SeaweedFS S3 object storage)."
related_docs:
  - "overview.md"
  - "../research/seaweedfs_s3_architecture.md"
  - "../troubleshooting/storage_db_and_redis.md"
---

# Storage & Health Endpoints Specification

---

## 1. `GET /api/v1/health` — System & Infrastructure Telemetry

Returns the operational readiness of `sineva-platform`, its connection configurations for PostgreSQL, Redis, SeaweedFS S3, and the reachability of the internal `sineva-ai` engine over `sineva_internal`.

### Response `200 OK`
```json
{
  "success": true,
  "status": 200,
  "message": "Sineva Platform BFF is healthy",
  "data": {
    "service_name": "sineva-platform",
    "service_version": "1.0.0",
    "environment": "production",
    "uptime_seconds": 3842,
    "dependencies": {
      "postgres_configured": true,
      "redis_configured": true,
      "seaweedfs_s3_endpoint": "http://seaweedfs-s3:8333",
      "ai_engine_internal_url": "http://sineva-ai:8000",
      "ai_engine_status": "reachable"
    }
  },
  "meta": {
    "request_id": "req_1761001700000_hlth01",
    "timestamp": "2026-10-21T00:28:20.000Z"
  },
  "errors": null
}
```

---

## 2. `POST /api/v1/storage/presign` — Generate SeaweedFS S3 Presigned Ticket

Generates a time-limited S3-compatible presigned upload (`PUT`) URL and object metadata for uploading multimodal artifacts (PDF financial reports, CSV datasets, audio briefings, images) directly to **SeaweedFS S3** (`http://seaweedfs-s3:8333` / bucket `sineva-assets`).

### Request Body (`application/json`)
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `file_name` | `string` | Yes | Original filename (`q3_board_deck.pdf`). Sanitized into a safe object key. |
| `content_type` | `string` | Yes | MIME type (`application/pdf`, `image/png`, `text/csv`). |
| `folder_prefix` | `string` | No | Logical folder prefix (`agents/sino-finance`, `uploads/shared`). Defaults to `workspace-artifacts`. |
| `expires_in_seconds` | `integer` | No | Expiration window in seconds (`60..3600`, default `900`). |

```json
{
  "file_name": "q3_financial_variance.pdf",
  "content_type": "application/pdf",
  "folder_prefix": "agents/sino-finance",
  "expires_in_seconds": 900
}
```

### Response `200 OK` (`ApiResponse<StoragePresignTicket>`)
```json
{
  "success": true,
  "status": 200,
  "message": "SeaweedFS S3 presigned upload ticket generated successfully",
  "data": {
    "object_key": "agents/sino-finance/1761001800000_q3_financial_variance.pdf",
    "bucket_name": "sineva-assets",
    "upload_url": "http://localhost:8333/sineva-assets/agents/sino-finance/1761001800000_q3_financial_variance.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
    "public_download_url": "http://localhost:8333/sineva-assets/agents/sino-finance/1761001800000_q3_financial_variance.pdf",
    "content_type": "application/pdf",
    "expires_in_seconds": 900,
    "required_headers": {
      "content_type": "application/pdf"
    }
  },
  "meta": {
    "request_id": "req_1761001800000_s3p09",
    "timestamp": "2026-10-21T00:30:00.000Z"
  },
  "errors": null
}
```
