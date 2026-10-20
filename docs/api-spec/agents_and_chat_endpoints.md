---
title: "Agents & Chat Endpoints Specification"
category: "api-spec"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "api-spec", "agents", "chat", "pagination", "snake-case"]
summary: "Detailed endpoint specifications for GET /api/v1/agents, POST /api/v1/agents, and POST /api/v1/agents/{agent_slug}/chat."
related_docs:
  - "overview.md"
  - "../engineering/response_pattern.md"
  - "storage_and_health_endpoints.md"
---

# Agents & Chat Endpoints Specification

These endpoints manage the catalog of specialized Sineva AI companions and proxy interactive chat/delegation turns to the internal `sineva-ai` engine over `sineva_internal`.

---

## 1. `GET /api/v1/agents` — List AI Companions (Paginated)

Returns a paginated array of registered AI companions (`@SinoPeople`, `@SinoFinance`, `@SinoSales`, `@SinoSocial`, `@SinoHelp`, `@SinoInsights`).

### Query Parameters (`snake_case`)
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `page` | `integer` | `1` | 1-indexed page number (`>= 1`). |
| `per_page` | `integer` | `10` | Items per page (`1..100`). |
| `department` | `string` (optional) | — | Filter by department (`hr`, `finance`, `sales`, `marketing`, `support`, `analytics`). |
| `is_active` | `boolean` (optional) | — | Filter by active status (`true` or `false`). |

### Response `200 OK` (`ApiResponse<AgentEntity[]>`)
```json
{
  "success": true,
  "status": 200,
  "message": "AI companions retrieved successfully",
  "data": [
    {
      "agent_id": "agt_sino_people",
      "agent_slug": "sino-people",
      "display_name": "@SinoPeople",
      "department": "hr",
      "role_title": "People & Culture Partner",
      "description": "Automates onboarding workflows, competency matrices, and HR policy synthesis.",
      "avatar_accent_token": "--teal-500",
      "default_model": "gpt-4o",
      "capabilities": ["onboarding_automation", "policy_rag", "competency_matrix"],
      "is_active": true,
      "latency_p95_ms": 380,
      "created_at": "2026-10-21T00:00:00.000Z",
      "updated_at": "2026-10-21T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 10,
    "total_items": 6,
    "total_pages": 1,
    "has_next": false,
    "has_prev": false,
    "request_id": "req_1761001500000_ab12cd34",
    "timestamp": "2026-10-21T00:25:00.000Z"
  },
  "errors": null
}
```

---

## 2. `POST /api/v1/agents` — Register New AI Companion

Creates and persists a new specialized AI companion in the catalog.

### Request Body (`application/json`)
```json
{
  "agent_slug": "sino-legal",
  "display_name": "@SinoLegal",
  "department": "legal",
  "role_title": "Commercial Contracts Counsel",
  "description": "Reviews SaaS MSAs, DPAs, and vendor security addenda.",
  "avatar_accent_token": "--teal-600",
  "default_model": "gpt-4o",
  "capabilities": ["msa_redline", "dpa_compliance", "clause_extraction"]
}
```

### Response `201 Created` (`ApiResponse<AgentEntity>`)
Returns the newly created `AgentEntity` with generated `agent_id`, `created_at`, and `updated_at`. Returns `409 Conflict` if `agent_slug` already exists or `422 Unprocessable Entity` if required fields are missing.

---

## 3. `POST /api/v1/agents/{agent_slug}/chat` — Chat with Companion

Dispatches a user prompt to the specified companion. The platform validates the companion, attaches internal authentication (`X-Internal-Api-Key`), and forwards the request to `http://sineva-ai:8000/api/v1/agents/{agent_slug}/chat`.

### Path Parameters
- `agent_slug`: Companion slug (e.g., `sino-finance`, `sino-people`).

### Request Body (`application/json`)
```json
{
  "prompt": "Summarize our Q3 cloud infrastructure variance and recommend 3 cost optimizations.",
  "conversation_id": "conv_20261021_exec01",
  "context_metadata": {
    "workspace_id": "ws_sineva_hq",
    "fiscal_quarter": "2026-Q3"
  }
}
```

### Response `200 OK` (`ApiResponse<AgentChatResponseDto>`)
```json
{
  "success": true,
  "status": 200,
  "message": "Companion response generated successfully",
  "data": {
    "agent_slug": "sino-finance",
    "display_name": "@SinoFinance",
    "conversation_id": "conv_20261021_exec01",
    "reply_markdown": "### Q3 Cloud Infrastructure Variance\nOperating spend was **4.2% under budget**...",
    "delegated_tools": ["financial_ledger_query", "qdrant_knowledge_search"],
    "execution_source": "sineva_ai_internal_engine",
    "latency_ms": 412
  },
  "meta": {
    "request_id": "req_1761001600000_chat9901",
    "timestamp": "2026-10-21T00:26:40.000Z"
  },
  "errors": null
}
```
