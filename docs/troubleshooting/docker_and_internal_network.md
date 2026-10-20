---
title: "Docker & Internal Network Debugging"
category: "troubleshooting"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "troubleshooting", "docker", "network", "sineva_internal", "sineva-ai"]
summary: "Diagnostic commands for verifying container-to-container connectivity between sineva-platform and sineva-ai over the sineva_internal bridge network."
related_docs:
  - "common_issues.md"
  - "../deployment/docker_compose_topology.md"
  - "../deployment/internal_network_security.md"
---

# Docker & Internal Network Debugging (`sineva_internal`)

Because `sineva-ai` uses `expose: ["8000"]` instead of `ports: ["8000:8000"]`, `http://localhost:8000` is intentionally unreachable from your host browser or terminal. All communication with `sineva-ai` happens inside the `sineva_internal` Docker bridge network.

---

## 1. Verify Both Containers Are Attached to `sineva_internal`

```bash
docker network inspect sineva_internal --format '{{range .Containers}}{{.Name}}: {{.IPv4Address}}{{"\n"}}{{end}}'
```
Expected output includes `sineva-platform`, `sineva-ai`, `sineva-postgres`, `sineva-redis`, `sineva-qdrant`, and `sineva-seaweedfs-s3`.

---

## 2. Test Internal Connectivity from `sineva-platform` to `sineva-ai`

Run an internal health probe from inside the `sineva-platform` container:
```bash
docker exec -it sineva-platform wget -qO- \
  --header="X-Internal-Api-Key: sineva_internal_service_token_dev" \
  http://sineva-ai:8000/api/v1/health
```

---

## 3. Troubleshooting `401 Unauthorized` / `403 Forbidden` Between Services

### Symptom
`sineva-platform` logs an `UPSTREAM_AI_ENGINE_ERROR` with status `401` or `403` when calling `http://sineva-ai:8000/api/v1/agents/{agent_slug}/chat`.

### Root Cause
Mismatch between `AI_ENGINE_INTERNAL_API_KEY` in `sineva-platform` and `INTERNAL_API_KEY` in `sineva-ai`.

### Resolution
Ensure both services share the exact same secret token in `.env` and `docker-compose.yml`, then recreate both containers:
```bash
docker compose up -d --force-recreate sineva-ai sineva-platform
```
