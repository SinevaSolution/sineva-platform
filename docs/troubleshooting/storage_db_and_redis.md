---
title: "Storage, PostgreSQL & Redis Troubleshooting"
category: "troubleshooting"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "troubleshooting", "postgresql", "redis", "seaweedfs", "s3"]
summary: "Runbook for diagnosing PostgreSQL 17 connection pools, Redis cache namespaces, and SeaweedFS S3 presigned URL signatures."
related_docs:
  - "common_issues.md"
  - "../engineering/database_conventions.md"
  - "../api-spec/storage_and_health_endpoints.md"
---

# Storage, PostgreSQL & Redis Troubleshooting

---

## 1. SeaweedFS S3 Presigned URLs (`SignatureDoesNotMatch` or `NoSuchBucket`)

### Symptom
Uploading a file using the `upload_url` returned by `POST /api/v1/storage/presign` fails with `SignatureDoesNotMatch` or `404 NoSuchBucket`.

### Checklist & Resolution
1. **Path-Style Addressing**: SeaweedFS S3 requires `S3_FORCE_PATH_STYLE=true` (`http://seaweedfs-s3:8333/sineva-assets/<key>`), not virtual-hosted-style (`http://sineva-assets.seaweedfs-s3:8333`).
2. **Matching `Content-Type` Header**: The client performing the `PUT` upload MUST send the exact `Content-Type` header requested when generating the presigned URL.
3. **Verify SeaweedFS S3 Gateway Health**:
   ```bash
   docker logs sineva-seaweedfs-s3 --tail 50
   ```

---

## 2. PostgreSQL Connection Refused on Port `5432`

### Symptom
`ECONNREFUSED 127.0.0.1:5432` during local `npm run dev`.

### Resolution
1. Check if `sineva-postgres` is running and healthy:
   ```bash
   docker ps --filter "name=sineva-postgres"
   docker exec -it sineva-postgres pg_isready -U sineva_user -d sineva_platform
   ```
2. Note that `sineva-platform` gracefully falls back to `InMemoryAgentRepository` if PostgreSQL is offline during rapid UI development or unit testing.

---

## 3. Redis Key Collisions Between Platform and AI Engine

### Prevention & Diagnostics
- `sineva-platform` connects to **Redis DB `0`** (`redis://redis:6379/0`) with key prefix `sineva:platform:`.
- `sineva-ai` connects to **Redis DB `1`** (`redis://redis:6379/1`) with key prefix `sineva:ai:`.
- Inspect active platform keys:
  ```bash
  docker exec -it sineva-redis redis-cli -n 0 KEYS "sineva:platform:*"
  ```
