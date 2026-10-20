---
title: "ADR-001: BFF Gateway Pattern over Isolated AI Engine"
category: "research"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Architecture Board"
tags: ["sineva", "research", "adr", "bff", "gateway", "microservices", "security"]
summary: "Architectural Decision Record explaining why Next.js (sineva-platform) serves as the sole public BFF gateway over an isolated Python FastAPI AI Engine (sineva-ai)."
related_docs:
  - "../project-structure/overview.md"
  - "../deployment/internal_network_security.md"
---

# ADR-001: BFF Gateway Pattern over Isolated AI Engine

## Status
**Accepted** (2026-10-21)

---

## 1. Context & Problem Statement

Sineva requires both:
1. A fast, modern React 19 / Next.js 15 user experience with SSR, optimistic UI, Redux state management, and enterprise session handling.
2. A specialized Python 3.13 AI runtime (`sineva-ai`) leveraging **Agno**, **Model Context Protocol (MCP)**, **Qdrant**, and async **SQLAlchemy** for multi-agent orchestration.

Exposing both Next.js (`:3000`) and FastAPI (`:8000`) directly to the public internet introduces CORS complexity, duplicate authentication middleware, split OpenAPI catalogs for web clients, and a wider attack surface for prompt-injection or MCP tool exploitation.

---

## 2. Architectural Decision

We adopt the **Backend-for-Frontend (BFF) Single Public Gateway Pattern**:
- **`sineva-platform` (Next.js 15)** is the **sole public entry point** (`:3000`).
- **`sineva-ai` (FastAPI)** is deployed on an isolated internal Docker bridge (`sineva_internal`) with `expose: ["8000"]` and **zero host port bindings**.
- All client-initiated AI actions (`GET /api/v1/agents`, `POST /api/v1/agents/{agent_slug}/chat`) are authenticated, rate-limited, and validated at `sineva-platform` before being proxied over `sineva_internal` via `AiEngineHttpGateway` with `X-Internal-Api-Key`.

---

## 3. Consequences & Benefits

| Dimension | Benefit |
| :--- | :--- |
| **Security Boundary** | Internal MCP tools, Qdrant vector indexes, and LLM keys inside `sineva-ai` are completely unreachable from external networks. |
| **Zero CORS Overhead** | Browser clients only ever call same-origin `/api/v1/*` routes on `sineva-platform`. |
| **Unified Wire Contract** | Both services share the identical `snake_case` `ApiResponse<T>` envelope (`success`, `status`, `message`, `data`, `meta`, `errors`). |
| **Graceful Resilience** | If `sineva-ai` is restarting or scaling, `sineva-platform` can serve cached metadata or graceful fallback responses without breaking the UI. |
