---
title: "Docker Compose Topology & Shared Infrastructure"
category: "deployment"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Infrastructure & Engineering"
tags: ["sineva", "docker", "docker-compose", "postgres", "redis", "seaweedfs", "qdrant", "topology"]
summary: "Complete specification of the 9-service Docker Compose stack on the sineva_internal bridge network."
related_docs:
  - "internal_network_security.md"
  - "ci_cd_pipeline.md"
  - "../project-structure/overview.md"
---

# Docker Compose Topology & Shared Infrastructure

The root [`docker-compose.yml`](../../docker-compose.yml) in `sineva-platform` orchestrates the entire Sineva stack—including shared databases, object storage, vector storage, the internal AI Engine (`sineva-ai`), and the public Next.js BFF (`sineva-platform`)—over a dedicated bridge network named `sineva_internal`.

---

## 1. Service Inventory & Port Matrix

| Service Name | Container Name | Image / Build | Internal Address (`sineva_internal`) | Host Port Mapping | Role |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `sineva-platform` | `sineva-platform` | `./Dockerfile` | `http://sineva-platform:3000` | `3000:3000` (Public) | Next.js 15+ Web UI & Public BFF Gateway |
| `sineva-ai` | `sineva-ai` | `../sineva-ai/Dockerfile` | `http://sineva-ai:8000` | **NONE** (`expose: ["8000"]`) | Internal FastAPI + Agno + MCP AI Engine |
| `postgres` | `sineva-postgres` | `postgres:17-alpine` | `postgres:5432` | `5432:5432` | Shared PostgreSQL 17 (`sineva_platform` DB) |
| `redis` | `sineva-redis` | `redis:7.4-alpine` | `redis:6379` | `6379:6379` | Shared Redis (DB 0: Platform, DB 1: AI Engine) |
| `seaweedfs-master` | `sineva-seaweedfs-master` | `chrislusf/seaweedfs:latest` | `seaweedfs-master:9333` | `9333:9333` | SeaweedFS cluster coordinator |
| `seaweedfs-volume` | `sineva-seaweedfs-volume` | `chrislusf/seaweedfs:latest` | `seaweedfs-volume:8080` | Internal | SeaweedFS block volume server |
| `seaweedfs-filer` | `sineva-seaweedfs-filer` | `chrislusf/seaweedfs:latest` | `seaweedfs-filer:8888` | `8888:8888` | POSIX/HTTP directory metadata filer |
| `seaweedfs-s3` | `sineva-seaweedfs-s3` | `chrislusf/seaweedfs:latest` | `http://seaweedfs-s3:8333` | `8333:8333` | S3-compatible object gateway (`sineva-assets`) |
| `qdrant` | `sineva-qdrant` | `qdrant/qdrant:v1.13.4` | `http://qdrant:6333` | `6333:6333` | Vector database for RAG & companion memory |

---

## 2. Persistent Volumes

All stateful services mount named Docker volumes so data survives container restarts:
- `postgres_data`: `/var/lib/postgresql/data`
- `redis_data`: `/data` (with `--appendonly yes` enabled)
- `seaweed_master_data`: `/data`
- `seaweed_volume_data`: `/data`
- `qdrant_data`: `/qdrant/storage`

---

## 3. Lifecycle Commands

```bash
# Build and start the entire stack in detached mode
docker compose up -d --build

# Tail logs for the BFF and internal AI Engine
docker compose logs -f sineva-platform sineva-ai

# Stop containers while preserving persistent volumes
docker compose down
```
