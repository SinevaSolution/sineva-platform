---
title: "ADR-0015: sineva-ai owns the internal chat contract"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "contract", "chat", "fixtures", "cross-service"]
summary: "sineva-ai defines the internal chat request and response, the platform gateway adapts to it, and shared JSON fixtures copied byte for byte keep the two repositories in step."
related_docs:
  - "0001-bff-gateway.md"
  - "0003-snake-case-wire-contract.md"
  - "0012-canonical-product-slugs-and-guardrails.md"
  - "0016-upstream-failures-return-502-503.md"
  - "../api-spec/agents_and_chat_endpoints.md"
  - "../engineering/testing_strategy.md"
adr_id: "0015"
decision_status: "Accepted"
supersedes: []
---

# ADR-0015: sineva-ai owns the internal chat contract

## Status

Accepted (2026-10-21).

Cross-service: mirrored in sineva-ai `docs/decisions/` (a sineva-ai ADR of the same title; that folder does not exist yet, so no number is cited). Change both repos together.

## Context

The platform defined its own chat request and reply (`message_text`, `reply_text`, `reasoning_summary`, `suggested_actions`) and sent them to `sineva-ai` under an internal header the engine did not accept ([ADR-0013](0013-internal-service-auth-header.md)). A fallback reply hid the mismatch ([ADR-0008](0008-no-silent-fallbacks.md)). Two services each owning half of a contract is how that went unnoticed.

`sineva-ai` runs the model and knows what it can return: the reply, the routed product, the model id, token usage, tool calls and citations. Its `ChatRequestDTO` forbids unknown keys, and its `ChatResponseDTO` and success envelope are in `sineva-ai` source.

## Decision

`sineva-ai` owns `POST /api/v1/agents/{agent_slug}/chat`: `ChatRequestDTO`, `ChatResponseDTO` and the success envelope. The platform gateway (`InternalAiEngineGateway`) adapts to it, not the other way round.

Request mapping, platform to `sineva-ai`:

| Platform public request | Sent to sineva-ai |
| :--- | :--- |
| `message_text` | `user_message` |
| `session_id` (optional UUID) | `session_id`, passed through |
| `user_id` | `user_id`, passed through |
| `context_metadata` | `context_metadata`, passed through |
| `agent_slug` | only in the URL-encoded path, never in the body |

- Current gap: there is no `tenant_id`. The public chat request carries no workspace, so the gateway does not send it and `sineva-ai` applies its own default (`default_tenant`).
- The gateway validates the upstream envelope with Zod (`success: true` plus the `data` shape). Unknown fields are dropped, so `sineva-ai` can add fields without breaking the platform. A missing or mistyped field is an error ([ADR-0016](0016-upstream-failures-return-502-503.md)).
- The public chat response mirrors the `sineva-ai` fields: `message_id`, `session_id`, `agent_slug`, `display_name`, `handle`, `routed_agent_slug`, `reply_content`, `model_id`, `execution_mode`, `token_usage`, `tool_calls`, `citations`, `created_at`. The platform adds `latency_ms`. The view type is `src/shared/chat_view.ts`, guarded by `server/http/chat_view_contract.ts`.
- This is a breaking change to the public response. `reply_text`, `reasoning_summary` and `suggested_actions` are gone, and the reply text is `reply_content`.
- Two JSON fixtures define the contract: `chat_request.json` and `chat_response_envelope.json`. They live in `sineva-ai/tests/contract/fixtures/` and are copied byte for byte to `apps/web/src/__tests__/contract/fixtures/`. The platform copy is never edited by hand. A change starts in `sineva-ai`, the copy lands here in the same change, and both repositories are updated together.

## Consequences

- Drift fails a test on either side: `test_chat_contract.py` in `sineva-ai` and `internal_ai_engine_gateway.contract.test.ts` here. The copy itself is checked by `diff -r` (rule R-40 in [agent rules](../governance/agent_rules.md)). Nothing automated compares the two directories; the check is manual until CI can see both repos.
- The platform UI shows what `sineva-ai` returns. It has no field for "reasoning summary" or "suggested actions" until `sineva-ai` provides them.
- `chat_messages.reasoning_summary`, `suggested_actions` and `tokens_used` in the platform schema are not filled from any reply field. They are unused columns, known debt.
- `user_id` is still taken from the request body and the dashboard hardcodes `usr_executive_01`. `sineva-ai` also does not check that a `session_id` belongs to the caller. Both are open security gaps; the second is on the `sineva-ai` side.

## Alternatives considered

- The platform owns the contract and `sineva-ai` adapts. Rejected: the engine's output shape (routing, tools, citations) comes from the engine, and the platform would have to invent fields it cannot fill.
- A shared schema package or generated clients. Not chosen: the repositories are in two languages, and fixtures need no tooling. Revisit if the contract grows past a few endpoints.
- Keep the old public fields and map them from the new ones. Rejected: it keeps invented fields (`reasoning_summary`, `suggested_actions`) alive with nothing real behind them.
