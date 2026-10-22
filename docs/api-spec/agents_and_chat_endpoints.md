---
title: "Agents and Chat Endpoints"
category: "api-spec"
status: "active"
version: "2.1.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "api-spec", "agents", "chat", "contract-v2", "sineva-ai", "signed-context", "snake-case"]
summary: "The workspace specialist roster route (sineva-ai catalog merged with the static manifest), Contract v2 internal gateway with sineva-ai, and retirement of legacy /api/v1/agents routes."
related_docs:
  - "overview.md"
  - "storage_and_health_endpoints.md"
  - "swagger_and_openapi.md"
  - "../decisions/0013-internal-service-auth-header.md"
  - "../decisions/0015-sineva-ai-owns-internal-chat-contract.md"
  - "../decisions/0016-upstream-failures-return-502-503.md"
  - "../decisions/0018-workspace-tenancy-and-public-contract.md"
  - "../decisions/0021-signed-internal-context.md"
  - "../decisions/0024-specialist-manifest-and-catalog-split.md"
  - "../engineering/error_handling_and_failure_modes.md"
  - "../product/product_model_and_wording.md"
---

# Agents and Chat Endpoints

Source: `apps/web/src/app/api/v1/workspaces/[workspace_id]/agents/route.ts`, `src/server/application/use-cases/list_workspace_specialists_use_case.ts`, `src/shared/specialists/manifest.ts`, `src/server/application/dtos/agent_dto.ts`, `src/server/application/dtos/chat_v2_dto.ts`, and `src/server/infrastructure/gateways/internal_ai_engine_gateway.ts`.

## Public Contract Evolution (WP-M0-28, ADR-0018)

- **Legacy Route Retired**: `POST /api/v1/agents/{agent_slug}/chat` has been permanently deleted. In Sineva Platform v1.0, user interactions take place through conversation threads managed via workspace-scoped conversation endpoints (`/api/v1/workspaces/{workspace_id}/conversations`, WP-M0-29).
- **Zero Identity in Payloads (SEC-2, API-4)**: Client payloads must never include `user_id` or `workspace_id`. Tenancy and caller identity are derived exclusively server-side from session cookies and `RequestContext`.
- **Idempotency Key**: Message generation requires `client_message_id` (UUID) supplied by the client (closes API-3).

---

## `GET /api/v1/workspaces/{workspace_id}/agents`

The specialist roster ([ADR-0024](../decisions/0024-specialist-manifest-and-catalog-split.md), FR-SPEC-05 to FR-SPEC-08, FR-SPEC-13). `GET /api/v1/agents` and `POST /api/v1/agents` no longer exist: the platform does not store or create specialists, and nothing under `/api/v1/agents` answers (the framework returns 404).

Availability comes from sineva-ai (`GET /api/v2/agents`, called on every request with `X-Internal-Api-Key`); display copy, `accent_key`, `room_theme_id` and `order` come from the static manifest (`src/shared/specialists/manifest.ts`). The roster is returned whole, without pagination. Guard: session, workspace membership (404 for another tenant), permission `specialist.view`.

### Query Parameters (`listAgentsQuerySchema`)

| Parameter | Type | Default | Constraint |
| :--- | :--- | :--- | :--- |
| `category_filter` | enum | none | the 13 categories of the sineva-ai enum (`people_hr`, `finance_ops`, `sales_growth`, `social_marketing`, `customer_support`, `data_insights`, `personal_ops`, `content_studio`, `marketplace_ops`, `it_security`, `tax_compliance`, `legal_drafting`, `inventory_procurement`) |

### Example Response (200 OK, abridged to one specialist)

```json
{
  "success": true,
  "status": 200,
  "message": "Specialists retrieved successfully",
  "data": {
    "catalog_version": "cat-2026-10-22-a",
    "items": [
      {
        "agent_slug": "sinofinance",
        "handle": "SinoFinance",
        "display_name": "SinoFinance",
        "category": "finance_ops",
        "wave": 1,
        "status": "live",
        "enabled": true,
        "accent_key": "finance",
        "room_theme_id": "sinofinance",
        "order": 2,
        "copy": {
          "en": {
            "role_title": "Finance & Cash Flow Specialist",
            "short_description": "Explains invoices, flags unusual spending and outlines your cash flow. Gives information, never moves money.",
            "starter_prompts": ["Make a simple cash flow plan for next month", "Explain this invoice and what I should check", "Draft a polite payment reminder to a client"]
          },
          "id": {
            "role_title": "Spesialis Keuangan & Arus Kas",
            "short_description": "Menjelaskan invoice, menandai pengeluaran yang tidak biasa, dan menyusun gambaran arus kas. Memberi informasi, tidak pernah memindahkan uang.",
            "starter_prompts": ["Buat rencana arus kas sederhana untuk bulan depan", "Jelaskan invoice ini dan apa yang perlu aku periksa", "Buat draf pengingat pembayaran yang sopan untuk klien"]
          }
        },
        "my_access": "available"
      }
    ]
  },
  "meta": { "request_id": "req_1792547075000_k3j9x2ab", "timestamp": "2026-10-21T01:44:35.000Z" },
  "errors": null
}
```

### Fields

- `enabled` is derived in this release: a wave 1 specialist that sineva-ai reports `live` is on. It is not a stored setting; per-workspace enablement arrives with `workspace_specialists` (M1).
- `my_access` is `available` or `unavailable`, from the caller's role (`specialist.use`) and `specialist_scope` with its allowed list. A specialist the caller may not use has the same keys as one that is not enabled, so the response does not say why.
- There are no latency, token, session-count or model fields: the platform never held real values for them.
- A catalog entry the manifest cannot present (the orchestrator `sino`, wave 2 and 3 `coming_soon`) is skipped. A manifest specialist missing from the catalog fails the call with 502 `catalog_drift`.

### Errors

| Status | Code | When |
| :--- | :--- | :--- |
| 401 | `unauthorized` | No session |
| 404 | `RESOURCE_NOT_FOUND` | The caller is not a member of the workspace |
| 422 | `validation_failed` | Unknown `category_filter` |
| 502 | `UPSTREAM_ERROR`, `catalog_drift` | sineva-ai answered non-2xx, non-JSON or off-contract, or its catalog does not list a manifest specialist |
| 503 | `UPSTREAM_UNAVAILABLE` | sineva-ai is unreachable. The manifest is never served as a roster |

### Assumed sineva-ai shape

The sineva-ai half (WP-M0-19) and its `catalog_slugs.json` fixture do not exist yet. The platform reads, after an optional `{ success, data }` envelope, `{ catalog_version, agents: [{ agent_slug, handle, category, wave, status }] }` and ignores other fields. The Zod schema is `agentCatalogV2Schema` in `src/server/infrastructure/gateways/ai_engine_v2_schemas.ts`; adjust it when the fixture lands.

---

## Internal AI Engine Contract v2 (`sineva-ai`)

The platform connects to `sineva-ai` using `InternalAiEngineGateway` (`src/server/infrastructure/gateways/internal_ai_engine_gateway.ts`). All requests execute against v2 internal endpoints using asymmetric cryptographic context minting.

### Required Internal Headers

Every service-to-service invocation from `sineva-platform` to `sineva-ai` sends four mandatory headers:

| Header | Description |
| :--- | :--- |
| `X-Internal-Api-Key` | Transport authentication key shared across internal services (`AI_ENGINE_INTERNAL_API_KEY`). |
| `X-Sineva-Context` | Ed25519 compact JWS token minted by `ContextSigner` carrying verified tenant, user, permissions, and budget constraints (ADR-0021, FR-AIR-06). |
| `traceparent` | W3C Distributed Tracing header (`00-${traceId}-${spanId}-01`). |
| `X-Request-Id` | Unique UUID request tracing identifier propagated end-to-end. |

### Contract v2 Endpoints

- `POST /api/v2/agents/{agent_slug}/chat` (Unary synchronous turn execution)
- `POST /api/v2/agents/{agent_slug}/chat/stream` (SSE Event stream execution)
- `GET /api/v2/agents` (The specialist catalog with `catalog_version`; sent with the internal key only, no signed context)
- `GET /api/v2/runs/{run_id}/events?after={seq}` (Replay run event transcript)
- `POST /api/v2/runs/{run_id}/cancel` (Cancel active execution)

### `ChatTurnRequestV2` Schema

```typescript
{
  user_message: string;              // Required prompt text
  session_id?: string | null;        // UUID conversation session (null on turn 1)
  client_message_id: string;         // Required UUID idempotency key
  mentions: Array<{                  // @mention offsets in user_message
    agent_slug: string;
    start: number;
    end: number;
  }>;
  attachments: Array<{               // Attached files from S3/SeaweedFS
    storage_key: string;
    filename: string;
    mime: string;
    size_bytes: number;
  }>;
  use_library: boolean;              // Whether to query workspace Library
  invoke_skill?: string | null;      // Optional skill override
  allow_degraded: boolean;           // Default false
}
```

Notice: `user_id`, `workspace_id`, and `tenant_id` are strictly forbidden in `ChatTurnRequestV2`. They are carried exclusively inside the signed JWS claims of `X-Sineva-Context`.

### `ChatTurnResultV2` Schema

```typescript
{
  run_id: string;                    // UUID execution run
  message_id: string;                // UUID generated assistant message
  session_id: string;                // UUID conversation session
  agent_slug: string;                // Addressed specialist
  routed_agent_slug: string;         // Specialist that responded
  handoffs: Array<{                  // Delegation records
    from_agent_slug: string;
    to_agent_slug: string;
    reason?: string;
  }>;
  reply_content: string;             // Markdown reply
  reply_language: string;            // 'id' | 'en'
  status: 'completed' | 'needs_approval' | 'needs_input' | 'budget_exceeded' | 'failed';
  finish_reason?: string | null;     // 'stop' | 'approval_required' | 'waiting_user_input' | ...
  model: {
    provider: string;                // 'anthropic' | 'openai' | ...
    model_id: string;
    execution_mode: string;          // 'agno_deterministic_runtime'
  };
  execution_mode: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  tool_calls: Array<{
    tool_name: string;
    arguments: Record<string, unknown>;
    result_summary?: string | null;
  }>;
  citations: Array<{
    document_id: string;
    title: string;
    similarity_score: number;
    source_uri?: string | null;
    score_kind?: string;
  }>;
  created_at: string;                // ISO 8601 timestamp
}
```

### SSE Event Vocabulary (`FR-AIR-10`)

During streaming (`/chat/stream`), the engine emits typed SSE events:
- `token`: Partial text generation tokens (`{ token: string }`).
- `handoff`: Specialist delegation notification.
- `handoff_result`: Specialist delegation result.
- `tool_call`: Tool invocation telemetry.
- `citation`: Grounded retrieval citations.
- `approval_required`: Autonomy ladder pause requiring user review.
- `card_started`, `card_patch`, `card_completed`: Rich AX result cards lifecycle.
- `step_started`, `step_completed`: Multi-step reasoning telemetry.
- `turn_limit`: Max turn budget reached.
- `usage`: Final token counts (`usage` replaces legacy `token_usage`).
- `done`: Terminal `ChatTurnResultV2` payload.
- `error`: Error payload (`{ code, message, details }`).

### Browser streaming relay (WP-M0-30, ADR-0022)

A chat turn is two steps. `POST /api/v1/workspaces/{workspace_id}/conversations/{conversation_id}/messages` stores the user message and returns a run handle (`run_<uuid>`). The browser then attaches to the stream. The handle is not the sineva-ai `run_id`; the platform maps one to the other in `chat_runs`.

| Route | Purpose |
| :--- | :--- |
| `GET /api/v1/workspaces/{workspace_id}/runs/{run_id}/events` | SSE relay. Header `Last-Event-ID` resumes. Needs `chat.send`. |
| `POST /api/v1/workspaces/{workspace_id}/runs/{run_id}/cancel` | Stop. The streamed text is kept and the reply is stored with status `cancelled`. Returns `{ run_id, status }`. |

Behaviour to know before you touch it:

- The first attach starts the sineva-ai stream (`POST /api/v2/agents/{slug}/chat/stream`) and records its `run_id` and `session_id`. Later attaches never start a second run. The next turn of the conversation sends the latest stored `session_id`.
- The relay reads upstream in a loop that does not depend on the browser. If the tab closes, the reply is still stored and sineva-ai cancel is never called.
- Events are forwarded with their original `id`, `event` and `data`. The platform adds only `error` events of its own: `upstream_unavailable` (503), `model_unavailable`, `dependency_unavailable` (503), `upstream_error`, `upstream_bad_response` (502), `upstream_interrupted` (502), `run_busy` and `stream_timeout` (reconnect), `run_cancelled`. Their data is `{ code, status, message, retryable }`. A stream never ends silently.
- If sineva-ai cannot be started, nothing is stored and the run stays `pending`, so retry attaches to the same handle. A failure after the stream started stores the reply with status `error` and the code in `finish_reason`.
- Resume: from memory while this process still holds the run (about a minute after it ends), otherwise from `GET /api/v2/runs/{id}/events?after={seq}`.
- Ownership (conversation owner inside the workspace) is checked before any upstream call. A foreign handle is a 404.
- `RunFrameGuard` is the hook where the card validator plugs in (WP-M0-32). M0 forwards everything.
- Latency (first token, total) is logged per specialist and reply language as `[run-metrics]`, without text.
- Gotchas: the in-memory buffer is per process (a restart or another instance falls back to the replay endpoint); the replay endpoint of sineva-ai (WP-M0-18) did not exist when this was written, so until it ships an attach ends with `upstream_unavailable`.

Browser side: `src/client/lib/event_stream.ts` (`openRunStream`) reads this stream with `fetch`, reconnects with backoff and `Last-Event-ID`, and maps error codes to message keys in `src/client/lib/stream_errors.ts`.

### Renaming and deleting a conversation

| Route | Purpose |
| :--- | :--- |
| `PATCH /api/v1/workspaces/{workspace_id}/conversations/{conversation_id}` | Body `{ title }`, trimmed, 1 to 120 characters (422 otherwise). Sets `title_source = 'user'` so a later automatic title never overwrites it. Needs `chat.create`. Audit `conversation.renamed`. |
| `DELETE /api/v1/workspaces/{workspace_id}/conversations/{conversation_id}` | Hard delete of the conversation, its messages and its `chat_runs`. Returns `{ id, deleted: true }`. Needs `chat.delete`. Audit `conversation.deleted`. |

- Only the owner can use either route. Another member, an admin and another workspace all get 404, never 403 (FR-HUB-32).
- Delete first cancels every non-terminal run through `CancelRunUseCase`, outside the transaction (the cancel calls sineva-ai). A refused or unreachable cancel (409, 502, 503) is logged as `run.relay_failed` with code `cancel_before_delete_failed` and the delete goes on; the person's deletion must not depend on sineva-ai being up. A drain that finishes later finds no run row and its message insert fails on the foreign key, so nothing is written into the deleted chat (logged as `store_reply_failed`).
- The counts for the audit row, the audit write and the delete share one transaction. The audit write comes first, so a failed audit leaves the data in place. Audit metadata is ids and counts only (`kind`, `agent_slug`, `message_count`, `run_count`; for a rename `title_length`), never titles or text.
- Messages and runs go through `ON DELETE CASCADE` (no migration needed). Attachments and their storage objects do not exist yet; purging them is the retention job (WP-M4-41).
- A message posted at the same moment as the delete can still fail with a foreign key error instead of a clean 404 (no lock on the conversation row). Rare and harmless: the delete wins.

### Upstream Error Mapping & Log Hygiene (SEC-6, ADR-0016)

The platform adapter maps upstream failure codes into strongly-typed platform domain errors without fabricating canned fallback responses:

| Upstream Status / Code | Platform Error Class | HTTP Status | Platform Error Code | Description |
| :--- | :--- | :--- | :--- | :--- |
| 503 `model_unavailable` | `ModelUnavailableError` | 503 | `model_unavailable` | Upstream AI model provider is overloaded or rate limited |
| 503 `dependency_unavailable` | `DependencyUnavailableError` | 503 | `dependency_unavailable` | Upstream Redis or Qdrant vector store is unreachable |
| 401 / 403 `context_invalid` | `ContextInvalidError` | 500 | `context_invalid` | Platform-minted JWS context was rejected by upstream (internal fault) |
| Non-2xx / Unparseable | `UpstreamServiceError` | 502 | `UPSTREAM_ERROR` | Upstream returned unexpected status or failed contract validation |
| Network drop / Timeout | `UpstreamUnavailableError` | 503 | `UPSTREAM_UNAVAILABLE` | Connection aborted, timed out, or socket hung up |

**Zero Body Logging (SEC-6)**: Internal logging records only `{ url, status, byte_length, reason, code }`. User prompt text, assistant reply text, and tool execution payloads are strictly prohibited from appearing in log streams.
