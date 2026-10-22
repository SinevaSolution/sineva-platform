---
title: "ADR-0044: Squad chat relay, signed context and turn bounds"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "squads", "chat", "sse", "signed-context", "cross-service"]
summary: "Squad turns reuse the run relay of ADR-0022. The platform mints a signed context with a squad claim, relays handoff, handoff_result and turn_limit events, stores handoffs so they survive a reload, and shows a points ceiling for lead-routed turns only. The sineva-ai contract is proposed by the platform."
related_docs:
  - "0022-run-handle-and-sse-relay.md"
  - "0043-squads-data-model-access-and-templates.md"
adr_id: "0044"
decision_status: "Accepted"
supersedes: []
---

# ADR-0044: Squad chat relay, signed context and turn bounds

## Status

Accepted (2026-10-23). Founder delegated. Cross-service: the contract below is **proposed by the platform**. sineva-ai (WP-M4-02 and WP-M4-03) has not built it; until it accepts or changes it, the platform builds against the fixtures `squad_*` in `src/__tests__/contract/fixtures/` (not copies). Merge order once sineva-ai agrees: sineva-ai fixtures first, platform copies them byte for byte.

## Context

FR-SQD-07 to 15, 19, 20 and 23 need a group chat where a lead may delegate to members under hard bounds. The platform already owns the run handle, the SSE relay, ownership checks, message and card persistence (ADR-0022, ADR-0025). Squad engine, bounds enforcement and member runs are sineva-ai's.

## Decision

1. **Same session table, same relay.** A squad chat is a `conversations` row with `kind = squad` and `squad_id`, private to its creator like any chat. `POST .../squads/{id}/sessions/{session_id}/messages` stores the person's message and returns a run handle (`run_<uuid>`) exactly like the Hub; the browser then attaches to the existing `GET .../runs/{run_id}/events`. `StreamRunUseCase` gains one optional collaborator, the squad turn port. For a squad conversation it asks the port for the turn (claim, bounds), calls `squadChatStream` instead of `chatStream`, and hands the three squad events to the port to store. Everything else (buffering, resume with `Last-Event-ID`, cancel, honest errors) is unchanged. Streaming through POST (the PRD wording) is not used: one relay is easier to keep correct than two.
2. **Upstream call.** `POST /api/v2/squads/{squad_id}/chat` (D-M4-2) with the headers of every call (`X-Internal-Api-Key`, `X-Sineva-Context`, `X-Request-Id`, `traceparent`). Body is the chat turn request of contract v2 (`user_message`, `session_id`, `client_message_id`, `mentions`, ...). A message that starts with a member mention is a direct address (FR-SQD-10); the platform re-parses mentions server-side and rejects a mention of a specialist that is not a member (`mention_not_in_squad`, 422). `POST /api/v2/squads/{squad_id}/runs` (workflows and routines) is reserved and not called yet.
3. **Signed context.** On top of the standard claims the platform adds `squad`:
   `{squad_id, lead_slug, members[{agent_slug, allowed_tools[], approval_policy, tier}], library_principals[], memory_namespace, bounds{max_delegations, max_parallel, max_wall_ms, max_tokens, max_credits}}` and a top-level `budget {max_credits, max_tokens}` (equal to the bounds). Library principals are `workspace` and `squad:<id>`; sineva-ai adds `agent:<slug>` of the executing member per delegation from `members`, never from the model. `memory_namespace` is `squad:<id>`. `allowed_tools` per member is the effective set of ADR-0043 point 11. The claim is built from the database and the session, never from the request body; the squad goal text is not in it (it is untrusted for permissions and sineva-ai reads it from its own session). `entitlements_digest` is left out until the plan catalog exists (WP-M4-38).
4. **Events.** The shared vocabulary plus three squad events:
   - `handoff` `{delegation_id, from, to, task_summary, parallel_group}`
   - `handoff_result` `{delegation_id, to, status: done|needs_review|failed, summary, error_code?, points?}`
   - `turn_limit` `{cap: cap_delegations|cap_tokens|cap_time|cap_credits, unfinished: string[]}`
   `token` may carry `speaker` (the lead, or the member in a direct address) so the screen can use one accent at a time. `done` is the contract v2 result with an optional `squad {termination_reason, delegation_count, points, contributors[]}`. A cap hit ends with `done` (a partial answer) after `turn_limit`; it is logged, not an error. A failed member is a `handoff_result` with `failed`; the lead says so in its answer and writes nothing for that member (FR-SQD-15). The relay validates these payloads and drops a malformed one with a log line rather than forwarding it.
5. **What is stored.** `squad_turns` (one per run: ceiling points shown, termination reason, delegation count, points, finish time) and `squad_handoffs` (one per delegation: from, to, task summary, parallel group, status, summary, error code, points). Writes are idempotent per `(turn, delegation_id)`, so a replay after a restart cannot duplicate. No message text is stored here; the answer is the assistant message as always. Handoff cards therefore remain after completion and reload (FR-SQD-11). The relay writes audit `squad.turn.limit_reached` on a `turn_limit` event.
6. **Cost.** There is no ledger or estimate service yet (M3 WPs not on this base). The composer gets `ceiling_points` from the squad's `limits` or the starter bounds, only for lead-routed turns; a direct `@SinoX` shows none (FR-BILL-05). Actual points come from `done.squad.points` and the per-delegation `points`, stored on the turn and shown as the per-member split in Activity. Reserve and commit against a ledger is a typed gap: `ceiling_points` is the number a ledger will reserve, and the stored actuals are what it will commit. Nothing is charged in `open` mode.
7. **Honest failures.** sineva-ai unreachable or off-contract gives the same typed error events as any run (503 or 502); the squad chat shows the existing error state with Retry. No replacement text is ever written.
8. **Activity.** `GET .../squads/{id}/activity` lists turns with the per-member split. A person sees their own turns; Owner and Admin see all turns of the squad. No message text.
9. **Hub mention.** In the Hub, a message that starts with `@<squad name>` opens a squad session for that squad and carries the message there; the Hub conversation is not used for squad turns (its upstream session would mix kinds). The composer lists squads in its `@` menu as a neutral chip. Sino never creates or edits a squad.

## Defaults taken (default, unconfirmed)

Starter bounds: 4 delegations, 2 parallel, 90 000 ms, 60 000 tokens, 40 points. The points number is a placeholder until the rate card exists. Squad names containing a space are matched by the longest name at the start of the message, case-insensitively.

## Consequences

- `AiEngineGateway` gains `squadChatStream`; fakes implement it.
- sineva-ai must accept or amend the `squad_*` fixtures before the engine work; the platform adapter schemas change in one place if it amends them.
- The shared `handoff` event of the earlier contract (`from_slug`, `to_slug`, `reason`) and the squad `handoff` differ; the squad stream uses the squad shape and the relay validates by conversation kind.

## Related

[ADR-0022](0022-run-handle-and-sse-relay.md), [ADR-0043](0043-squads-data-model-access-and-templates.md), [ADR-0025](0025-card-schema-registry.md).
