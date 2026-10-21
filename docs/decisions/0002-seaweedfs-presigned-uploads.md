---
title: "ADR-0002: SeaweedFS S3 with presigned uploads"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "seaweedfs", "s3", "storage", "presigned-url"]
summary: "File uploads go from the browser straight to SeaweedFS through a short-lived presigned PUT URL issued by the platform."
related_docs:
  - "0008-no-silent-fallbacks.md"
  - "../api-spec/storage_and_health_endpoints.md"
  - "../deployment/docker_compose_topology.md"
  - "../troubleshooting/storage_db_and_redis.md"
adr_id: "0002"
decision_status: "Accepted"
supersedes: []
---

# ADR-0002: SeaweedFS S3 with presigned uploads

## Status

Accepted (2026-10-21).

## Context

Users attach files (documents, spreadsheets, images) that the AI engine may read later. Streaming file bytes through the Next.js Node process would hold them in the web server's memory and tie up request handlers for the length of the upload. The stack also needs one S3-compatible store that both `sineva-platform` and `sineva-ai` can reach.

## Decision

Use SeaweedFS behind its S3 gateway, and let the browser upload directly with a presigned URL.

Topology (see `docker-compose.yml`): `seaweedfs-master` (9333), `seaweedfs-volume`, `seaweedfs-filer` (8888) and `seaweedfs-s3` (8333). The platform talks to the S3 gateway with `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, with path-style addressing (`S3_FORCE_PATH_STYLE=true`).

Upload flow:

1. The browser sends `POST /api/v1/storage/presign` with `workspace_id`, `file_name`, `content_type` and `file_size_bytes`. The Zod schema `presignStorageDtoSchema` caps `file_size_bytes` at 104,857,600 (100 MiB).
2. `PresignStorageUploadUseCase` asks the `StorageRepository` port for a URL. `SeaweedStorageRepository` builds the key `workspaces/{workspace_id}/{timestamp}_{sanitized_file_name}`, signs a `PutObject` command, and returns `object_key`, `upload_url`, `bucket_name`, `expires_in_seconds` (900) and `storage_provider`.
3. The browser `PUT`s the bytes to `upload_url`.
4. Target: the browser passes `object_key` to a chat request in `context_metadata`, and `sineva-ai` reads the object from SeaweedFS over `sineva_internal`. The platform forwards `context_metadata` today; whether `sineva-ai` fetches the object is not verified from this repository.

## Consequences

- File bytes never pass through the Next.js process.
- Object keys are scoped by `workspace_id`, which comes from the request body today. Without authentication that scoping is a naming convention, not an access control (rule R-27 in [agent rules](../governance/agent_rules.md)).
- The signed URL contains the host from `S3_ENDPOINT`. In `docker-compose.yml` that is `http://seaweedfs-s3:8333`, an internal hostname a browser cannot resolve. Inference from how request signing binds the host: browser uploads need a browser-reachable endpoint configured for signing. Check this before relying on uploads outside the Docker network.
- Known debt ([ADR-0008](0008-no-silent-fallbacks.md)): on a signing error `SeaweedStorageRepository` returns an unsigned URL instead of throwing, and `checkHealth()` only tests that `S3_ENDPOINT` is set, not that the store answers.
- Planned: a `storage_objects` row per upload ([ADR-0006](0006-shared-postgres-platform-schema.md)).

## Alternatives considered

- Proxy uploads through a Next.js route handler. Rejected: bytes buffer in the web process.

## Origin

Replaces `docs/research/seaweedfs_s3_architecture.md`. The earlier text made throughput and disk-seek performance claims with no source or measurement in this repository. They were dropped. Its example flow used a `public_download_url` field and a `sino-finance` slug, neither of which matches the current response or the canonical slugs ([ADR-0012](0012-canonical-product-slugs-and-guardrails.md)).
