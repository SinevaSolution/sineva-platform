---
title: "Internal Network Security & Zero-Port Isolation"
category: "deployment"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Security & Infrastructure"
tags: ["sineva", "security", "network-isolation", "zero-trust", "sineva_internal", "api-key"]
summary: "Security architecture enforcing zero host-port exposure for sineva-ai and authenticated service-to-service communication over sineva_internal."
related_docs:
  - "docker_compose_topology.md"
  - "../research/bff_gateway_pattern.md"
  - "../troubleshooting/docker_and_internal_network.md"
---

# Internal Network Security & Zero-Port Isolation

A core architectural invariant of the Sineva system is that **`sineva-ai` is strictly an internal microservice** and must never be directly reachable from the public internet or host network.

---

## 1. Zero Host-Port Exposure (`expose` vs `ports`)

In [`docker-compose.yml`](../../docker-compose.yml):
```yaml
  sineva-ai:
    build:
      context: ../sineva-ai
      dockerfile: Dockerfile
    container_name: sineva-ai
    restart: unless-stopped
    expose:
      - "8000"
    networks:
      - sineva_internal
```
- **No `ports:` directive is present** on `sineva-ai`. Docker does not bind port `8000` to `0.0.0.0` or `127.0.0.1` on the host.
- Only containers attached to the `sineva_internal` bridge network (`sineva-platform`) can resolve DNS hostname `sineva-ai` and connect to `http://sineva-ai:8000`.

---

## 2. Defense-in-Depth: `X-Internal-Api-Key` Verification

Network isolation is paired with cryptographic shared-secret authentication at the application layer:
1. **`sineva-platform` Outbound Gateway (`AiEngineHttpGateway`)**:
   - Reads `AI_ENGINE_INTERNAL_URL` (`http://sineva-ai:8000`) and `AI_ENGINE_INTERNAL_API_KEY` from server-only environment variables (never prefixed with `NEXT_PUBLIC_`).
   - Attaches `X-Internal-Api-Key` and `X-Request-Id` on every request to `sineva-ai`.
2. **`sineva-ai` Inbound Middleware**:
   - Validates `X-Internal-Api-Key` using constant-time comparison (`secrets.compare_digest`) before executing any agent or workflow route.
   - Rejects unauthorized requests immediately with `401 Unauthorized` wrapped in the standard `snake_case` error envelope.

---

## 3. Environment Variable Hygiene

| Variable | Scope | Exposed to Browser? |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | Client & Server | Yes |
| `NEXT_PUBLIC_API_BASE_URL` | Client & Server | Yes (`/api/v1`) |
| `AI_ENGINE_INTERNAL_URL` | Server-Only BFF | **NEVER** |
| `AI_ENGINE_INTERNAL_API_KEY` | Server-Only BFF | **NEVER** |
| `DATABASE_URL` | Server-Only BFF | **NEVER** |
| `S3_SECRET_ACCESS_KEY` | Server-Only BFF | **NEVER** |
