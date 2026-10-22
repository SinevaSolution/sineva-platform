---
title: "ADR-0046: Workflow run contract v2.1, platform side"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "workflows", "runs", "contract", "budget"]
summary: "The platform proposes the run contract v2.1 for workflows (start, snapshot, cancel, resume, pushed step events, budget claim) as fixtures, keeps a summary row plus step rows updated by events, and shows an honest 'cannot run yet' state when sineva-ai does not answer."
related_docs:
  - "0045-workflow-definition-versions-and-templates.md"
  - "0022-run-handle-and-sse-relay.md"
  - "0032-inbox-items-approvals-and-run-resume.md"
adr_id: "0046"
decision_status: "Accepted"
supersedes: []
---

# ADR-0046: Workflow run contract v2.1, platform side

## Status

Accepted (2026-10-23). Founder delegated. The contract is **proposed by the platform, pending sineva-ai** (the engine, run API and event relay, WP-M3-03/04, are blocked: needs sineva-ai team). The fixtures `apps/web/src/__tests__/contract/fixtures/workflow_*.json` are the proposal; sineva-ai accepts or changes them, then they become byte-identical copies.

## Context

sineva-ai owns run state (durable engine); the platform keeps a summary and reconciles (WP-M3-01 point 2). The engine does not exist yet, the platform must still ship the definition, publish, run screens and a test run flow, and must never invent a result (ADR-0008, ADR-0016).

## Decision

1. **Calls (platform to sineva-ai, `X-Internal-Api-Key`, `X-Sineva-Context`, `X-Request-Id`, `traceparent`).**
   - `POST /api/v2/runs` starts a run: `run_id` (a correlation id the platform chooses, column `engine_run_id`), `kind: "workflow"`, `mode` (`test` or `live`), `workflow_id`, `version_number` (null for a test of a draft), `definition` (the snapshot, so a run never reads a draft later), `definition_revision`, `inputs`, `trigger_type`, `routine_id`, `locale`, `library_principals`, `budget`. No `tenant_id` or `user_id`: they come from the signed context. Answer 202 `{run_id, status}`.
   - `GET /api/v2/runs/{run_id}` returns the authoritative snapshot (run status, credits, last sequence, one entry per step).
   - `POST /api/v2/runs/{run_id}/cancel` and `POST /api/v2/runs/{run_id}/resume` with `{mode: "from_failed_step" | "continue_after_budget"}` and an `Idempotency-Key`.
2. **Push (sineva-ai to platform, internal key only).** `POST /api/internal/v1/workflow-runs/events` with `event_id`, `run_id`, `tenant_id`, `sequence`, `type` (`run_status`, `step_started`, `step_completed`), `occurred_at`, `data`. The tenant must own the run; an event applies only with a sequence higher than the stored one (compare and set); a duplicate `event_id` is acknowledged. Step event names follow sineva-ai's vocabulary (D-M3-1 default `step_completed`).
3. **Statuses.** Run: `queued`, `running`, `waiting`, `needs_review`, `succeeded`, `failed`, `cancelled`, `budget_exceeded`. Step: `waiting`, `running`, `needs_review`, `done`, `failed`, `skipped`.
4. **Budget claim.** The signed context gains an optional `budget` object (`max_credits`, `max_tokens`, `max_tool_calls`, `max_wall_ms`, `max_media_jobs`, `max_media_cost`, each nullable). The platform fills it from the caller's ceiling; with no plan or cap yet every member is null (`open` mode never blocks).
5. **Platform state.** `workflow_runs` (summary, snapshot of the definition, `draft_revision` for the publish gate, `last_event_seq`) and `workflow_run_steps` (one row per step key, updated by events). `GET /workflow-runs/{id}` reconciles an active run by reading the snapshot; if sineva-ai is unreachable it returns the stored rows with `engine_reachable: false`. A terminal status is never set from anything but an event or a snapshot.
6. **Honest start.** The row is created `queued` before the call so an event that races the answer finds it. A 503 (unreachable) deletes the row and answers 503 `workflow_engine_unavailable`: nothing ran, so there is nothing to show in history. A 502 (bad answer) keeps the row `failed` with `engine_error`. The builder and the run dialog show "Sino cannot run Workflows yet" for the first. A timeout counts as 503, so a request the engine did receive but did not acknowledge can leave an orphan run there; its events find no row and are rejected with 404.
7. **Browser.** The run screen polls `GET /workflow-runs/{id}` every 2 seconds while the run is active. A platform SSE relay for runs (`.../events`) is not built in this slice; the poll answers FR-WF-23 (closing the tab never stops a run) and is replaced by the relay when the engine publishes its event stream.
8. **Trace.** Step `output_preview` (at most 2,000 characters) and `trace` are returned only with `workflow.trace.view`; other roles get status, timing and credits.

## Consequences

- Everything is testable with a fake upstream built from the fixtures.
- Until sineva-ai ships, every real start answers 503 and the UI says so.
- A contract change on sineva-ai's side means changing fixtures and `workflow_run_schemas.ts` together.

## Alternatives considered

- **Reuse the chat run endpoints only.** A workflow needs a definition snapshot and step state; chat runs have neither.
- **Keep failed starts in history.** A run that never existed would clutter the list and count as a failure.
- **Relay SSE now.** The engine has no stream to relay; a relay built against a guessed stream would be fiction.
