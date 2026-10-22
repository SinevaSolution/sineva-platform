---
title: "ADR-0022: Run handle and the SSE relay"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-22"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "chat", "sse", "streaming", "run-handle", "cross-service"]
summary: "The platform allocates the run handle when a message is sent, starts the sineva-ai stream on first attach, maps the handle to the sineva-ai run id in the chat_runs table, and keeps draining upstream when the browser leaves."
related_docs:
  - "0001-bff-gateway.md"
  - "0008-no-silent-fallbacks.md"
  - "0015-sineva-ai-owns-internal-chat-contract.md"
  - "0016-upstream-failures-return-502-503.md"
  - "0021-signed-internal-context.md"
  - "../api-spec/agents_and_chat_endpoints.md"
adr_id: "0022"
decision_status: "Accepted"
supersedes: []
---

# ADR-0022: Run handle and the SSE relay

## Status

Accepted (2026-10-22). Founder delegated: the implementation plan's decision D-M0-3 names this default, and the Founder delegated its acceptance to the work package that builds it (WP-M0-30). The `chat_runs` table is the plan's proposal and is recorded here as such. The sineva-ai twin of this ADR (stream endpoints, event ids, replay and cancel) belongs to WP-M0-18 and is not written by this change.

## Context

A chat turn is two steps (FR-HUB-20). Step 1, `POST .../conversations/{id}/messages`, stores the user's message. Step 2 streams the reply. sineva-ai owns the real run id and only reports it once the run exists, but the browser needs something to attach to straight after step 1. The browser can only reach the platform (ADR-0001), the stream must survive a closed tab (the reply is still stored), and a dropped connection must resume without losing or repeating events.

At the time of writing the sineva-ai v2 stream endpoints (WP-M0-18) do not exist. The platform half is built against the contract fixtures (`sse_transcript_*.txt`, `chat_turn_request_v2.json`) and a fake upstream.

## Decision

1. **Handle.** `POST .../messages` allocates `run_<uuid>` and stores it on the user message (`messages.run_id`). It is the only id the browser knows. It is not the sineva-ai run id.
2. **Attach.** `GET /api/v1/workspaces/{workspace_id}/runs/{run_id}/events` is the SSE relay. The handle is resolved through the user message, then through the conversation: the caller must own the conversation inside the workspace, otherwise the answer is 404 and no upstream call is made. The browser uses `fetch` streaming, not `EventSource`, so it can send `Last-Event-ID` and the CSRF-safe headers.
3. **Start on first attach.** The first attach claims the run (`pending` to `streaming`, a conditional update, so two tabs or two instances cannot start two runs), mints the signed context (ADR-0021) and opens `POST /api/v2/agents/{slug}/chat/stream` with the stored message. Later attaches never start a second run.
4. **Map the handle.** The sineva-ai `run_id` (from `run_started` or `done`) and `session_id` are stored on the `chat_runs` row. The next turn of the same conversation reuses the latest stored `session_id`.
5. **Keep draining.** The relay reads upstream in a detached loop that is independent of the browser connection. It persists the final assistant message on `done`, whatever the browser did. A browser disconnect never calls sineva-ai cancel (a run that waits for approval must survive a closed tab).
6. **Resume.** A reconnect sends `Last-Event-ID`. If this process is still draining the run (or finished it in the last minute) the missed frames come from an in-memory buffer. Otherwise they come from `GET /api/v2/runs/{upstream_run_id}/events?after={seq}` and the relay follows the run until it ends.
7. **Cancel.** `POST /api/v1/workspaces/{workspace_id}/runs/{run_id}/cancel` calls sineva-ai cancel with the same ownership check. The partial text is kept and the assistant message is stored with status `cancelled`.
8. **Failures are events.** If sineva-ai cannot be reached or answers badly, the relay emits a typed `error` event (for example `upstream_unavailable`, status 503) and ends the stream. It never ends a 200 stream silently and never invents text (ADR-0008, ADR-0016). A start failure leaves the run `pending`, so Retry attaches to the same handle. A failure after the stream started stores the assistant message with status `error` and the code in `finish_reason`.
9. **No content in logs.** Latency (first token, total) is recorded per specialist and reply language as a metric without text (FR-AIR-31).
10. **Card hook.** Every frame passes a `RunFrameGuard` before it is stored or forwarded. Card frames are validated there (ADR-0025); every other frame passes through.

### `chat_runs` (proposal, platform schema)

| Column | Notes |
| :--- | :--- |
| `id` | UUID, `gen_random_uuid()` |
| `workspace_id` | UUID, tenant column, FK to `workspaces` |
| `conversation_id` | UUID, FK to `conversations` |
| `user_message_id` | UUID, FK to `messages` |
| `run_handle` | Text, unique, the `run_<uuid>` handle |
| `agent_slug` | Target specialist |
| `status` | `pending`, `streaming`, `completed`, `cancelled`, `error`, `needs_approval`, `needs_input`, `budget_exceeded`, `failed` |
| `upstream_run_id`, `upstream_session_id` | From sineva-ai, nullable until known |
| `assistant_message_id` | Set when the reply is stored, nullable |
| `error_code` | Typed code of the last failure, nullable |
| `created_at`, `updated_at` | Timestamps |

## Consequences

- The relay holds an open upstream connection per live run inside one Node process. The in-memory buffer is a latency optimisation, not the source of truth: after a restart the replay endpoint of sineva-ai is. The relay therefore runs on the Node runtime only (never edge), dynamic, with compression off.
- A run started on instance A and attached from instance B is served by replay and polling, not by a live pipe. This is slower by about one poll interval and is acceptable for v1.0.
- `messages.status` gains `cancelled` and `error`.
- The proposal is cheap to change: `chat_runs` is platform-only and no other service reads it.
- Until WP-M0-18 ships, every attach ends in a typed `upstream_unavailable` event. The UI shows its friendly error state with Retry. That is the intended M0 behaviour, not a bug.

## Alternatives considered

- **Let sineva-ai allocate the handle at step 1.** Rejected: step 1 would then need a sineva-ai round trip before the message is stored, and a sineva-ai outage would block saving the user's own words.
- **Start the upstream run inside `POST .../messages`.** Rejected: the POST would have to stay open or hand a stream across requests, and tying the run to the first attach is what makes resume and idempotency simple.
- **Use the user message id as the handle.** Rejected: it exposes a storage id as a capability and gives resume nowhere to keep per-run state.
- **Browser talks to sineva-ai directly.** Rejected by ADR-0001.
- **`EventSource`.** Rejected: cannot send headers, cannot reconnect with our own backoff and error mapping.
