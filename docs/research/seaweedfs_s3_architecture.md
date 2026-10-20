---
title: "ADR-002: SeaweedFS S3 Architecture for Multi-Agent Artifacts"
category: "research"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Architecture Board"
tags: ["sineva", "research", "adr", "seaweedfs", "s3", "storage", "presigned-url"]
summary: "Evaluation and architectural design of SeaweedFS S3 (:8333) for storing and serving high-throughput multi-agent multimodal artifacts."
related_docs:
  - "../api-spec/storage_and_health_endpoints.md"
  - "../deployment/docker_compose_topology.md"
---

# ADR-002: SeaweedFS S3 Architecture for Multi-Agent Artifacts

## Status
**Accepted** (2026-10-21)

---

## 1. Context

Sineva AI companions (`@SinoFinance`, `@SinoPeople`, `@SinoSocial`, `@SinoInsights`) frequently ingest and produce thousands of small-to-medium files: PDF financial statements, CSV exports, generated charts, and audio/video snippets. Traditional object stores often suffer from metadata amplification on millions of small files, while routing binary uploads through the Next.js Node.js process creates memory pressure.

---

## 2. Decision: SeaweedFS with S3 Gateway + Direct Presigned Uploads

We deploy a 4-component **SeaweedFS** topology on `sineva_internal`:
1. **`seaweedfs-master` (`:9333`)**: Manages volume-to-machine mapping with O(1) disk seek overhead per file.
2. **`seaweedfs-volume` (`:8080`)**: Stores packed needle blobs efficiently on disk.
3. **`seaweedfs-filer` (`:8888`)**: Provides hierarchical directory paths and metadata.
4. **`seaweedfs-s3` (`:8333`)**: Exposes a full AWS S3-compatible API (`S3_FORCE_PATH_STYLE=true`) consumed by `@aws-sdk/client-s3` in `sineva-platform` and `aioboto3` in `sineva-ai`.

### Direct Presigned Upload Flow
```mermaid
sequenceDiagram
    participant Browser as Web Client
    participant Platform as sineva-platform (/api/v1/storage/presign)
    participant S3 as SeaweedFS S3 (:8333)
    participant AI as sineva-ai (:8000)

    Browser->>Platform: POST /api/v1/storage/presign (file_name, content_type)
    Platform-->>Browser: 200 OK (upload_url, object_key, public_download_url)
    Browser->>S3: PUT upload_url (binary stream)
    S3-->>Browser: 200 OK
    Browser->>Platform: POST /api/v1/agents/sino-finance/chat (object_key in context_metadata)
    Platform->>AI: Forward chat + object_key
    AI->>S3: Fetch object_key via aioboto3 on sineva_internal
```
