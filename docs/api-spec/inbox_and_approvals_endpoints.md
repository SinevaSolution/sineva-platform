---
title: "Inbox, Approvals and Input Request Endpoints"
category: "api-spec"
status: "active"
version: "1.0.0"
last_updated: "2026-10-22"
owner: "Sineva Engineering"
tags: ["sineva", "api-spec", "inbox", "approvals", "input-requests", "internal"]
summary: "The Inbox read and decision routes, the internal routes sineva-ai calls, the expiry job, and the proposed approval contract (events, create bodies, resume bodies)."
related_docs:
  - "overview.md"
  - "swagger_and_openapi.md"
  - "../decisions/0032-inbox-items-approvals-and-run-resume.md"
  - "../decisions/0022-run-handle-and-sse-relay.md"
---

# Inbox, approvals and input request endpoints

Source: `apps/web/src/app/api/v1/workspaces/[workspace_id]/{inbox,approvals}/**`, `apps/web/src/app/internal/v1/{approvals,input-requests,inbox}/**` (each also mounted under `/api/internal/v1/`), `application/use-cases/inbox/`, `application/inbox/approval_contract_dto.ts`, `domain/approvals/action_types.ts`. Decision: [ADR-0032](../decisions/0032-inbox-items-approvals-and-run-resume.md). Envelope and errors are in [overview](overview.md). Identity is the session user and the workspace is in the URL; no body names a user.

Current: the routes below, and the Inbox screen at `/w/{slug}/inbox` (two panes on desktop, list then detail on a phone). The screen asks for the views Needs you, Updates and Done ([ADR-0034](../decisions/0034-inbox-triage-views-and-updates-tab.md)).

## Public routes

All under `/api/v1/workspaces/{workspace_id}`. A workspace the caller is not in answers 404 on every route.

| Route | Permission | What it does |
| :--- | :--- | :--- |
| `GET /inbox?tab=&agent_slug=&kind=&source_type=&q=&cursor=&limit=` | `inbox.view` | Items, newest first, with `next_cursor`. `tab` is `needs_review`, `needs_input`, `needs_you` (both of those), `updates` (results) or `done` (resolved, dismissed or expired approvals and questions; `ideas` is a 422). `kind` is `approval`, `input_request` or `result`; `source_type` is `chat`, `room` or `system`; `q` is a case-insensitive part of the title, 80 characters at most. Filters apply before paging. `limit` 1 to 50, default 20 |
| `GET /inbox/counts` | `inbox.view` | `needs_review`, `needs_input`, `updates`, `done`, `unread_needs_review`, `unread_needs_input`, `unread_updates`, `badge` (`needs_review + needs_input`). Poll every 30 seconds and on tab focus, and after a decision |
| `GET /inbox/{item_id}` | `inbox.view` | Detail: payload, `editable_fields`, `approve_note_key`, revisions, and `source.conversation_id` for a chat item (the link back to the chat) |
| `POST /inbox/{item_id}/read` | `inbox.view` | Marks read for the caller. Idempotent, the first read time is kept |
| `POST /inbox/{item_id}/dismiss` | `inbox.answer` | Dismisses an open input request. An approval answers 409 `not_dismissable` |
| `POST /inbox/{item_id}/answer` | `inbox.answer` | Body `{version, answers}`, validated against the form |
| `POST /approvals/{approval_id}/decision` | `approval.decide_own` | Body `{decision: approve or reject, version, note?, edited_payload?}` |
| `POST /approvals/{approval_id}/changes` | `approval.decide_own` | Body `{version, instruction}`. The approval stays pending and awaits a revision |

Visibility: owner and admin see every item and may decide any (`approval.decide_any`); a member sees and decides items addressed to them (the person whose chat produced the item), anything else is a 404; a viewer sees Updates and Done only and receives summaries without payload, revision bodies, answers, notes or the source link. `GET /inbox?tab=needs_you` as a viewer is an empty page, not an error.

The decision, changes, answer and dismiss routes accept a Sineva session only. A bearer token that carries an `aud` claim, or starts with `mcp_`, is refused with 403 `wrong_token_audience` (stub until MCP tokens exist).

### Item view

`InboxItemView` in `src/shared/inbox_view.ts`: `id`, `kind`, `tab`, `state`, `agent_slug`, `title` (producer text, render escaped), `summary` (`{key, params}`: the platform-built sentence as a catalog key, localized by the client; params carry `specialist_slug` and `draft_kind`, never model text), `source`, `unread`, `expires_at`, `approval` (`id`, `status`, `version`, `revision`, `awaiting_revision`, `decided_by_name`, ...) and `input_request` (`id`, `question`, `fields`, `version`, ...). Send `approval.version` back with a decision.

### Decision order

1. Claim: a conditional update of the row (pending, matching version, nobody else holding it). The loser answers 409 `already_decided` and the decider's name is in `errors[]` (`field: decided_by`); a stale `version` is 409 `version_conflict`; while a change request awaits its revision it is 409 `awaiting_revision`.
2. Resume: sineva-ai is told the outcome. Unreachable is a typed 503 (`errors[0].code` is `run_resume_unavailable`), a bad answer is the typed 502. In both the claim is released and nothing is committed: the item stays pending and the same call can be retried.
3. Commit: the terminal state and the audit rows in one transaction. A failed audit write rolls the decision back.

Approve on `draft.review` marks the draft ready and executes nothing. Edits (approve only) change only `title` and `body`, are revalidated and re-hashed, and become a user revision; `approval.edited` is audited before `approval.approved`.

## Internal routes (sineva-ai to platform)

`X-Internal-Api-Key` only. Each is also mounted at `/api/internal/v1/...`.

| Route | What it does |
| :--- | :--- |
| `POST /internal/v1/approvals` | Creates an approval item. 201 new, 200 replay |
| `POST /internal/v1/input-requests` | Creates an input request item. 201 new, 200 replay |
| `POST /internal/v1/inbox/expire` | Runs the expiry job, no body. Safe to call repeatedly |

The chat relay creates the same items when it sees `approval_required` or `input_required` in a run's stream, so the browser attached to a chat needs no internal call. Both paths are idempotent on the sineva-ai id.

Expiry: default 7 days, a producer may ask for less or up to 30 days, never later than a time the action type names inside the payload. The job marks due items `expired`, never approves, resumes the run with `expired`, retries a resume that failed, releases decision claims older than two minutes, and returns `reminders_due` (approvals within 24 hours of expiry) for the notification work. Nothing here sends the reminder.

## Proposed approval contract (pending sineva-ai)

Fixtures: `apps/web/src/__tests__/contract/fixtures/approval_*.json`. They are proposed by the platform and pending sineva-ai; the byte-identical rule applies once sineva-ai accepts them.

### SSE `approval_required` (`data`)

```json
{
  "approval_id": "5d0c6a4e-7b1f-4c2a-9e83-0f6a2b1d4c77",
  "revision": 1,
  "action_kind": "draft.review",
  "tool_name": "create_draft_for_review",
  "agent_slug": "sinosocial",
  "draft_summary": "Caption Instagram untuk promo akhir pekan",
  "payload": { "draft_kind": "post", "title": "Promo Jumat", "body": "..." },
  "expires_at": "2026-10-29T10:00:00.000Z",
  "guardrail_reason": "sinosocial_posts_stay_drafts",
  "card_id": "crd_98765"
}
```

`approval_id` is sineva-ai's UUID. `revision` defaults to 1 and a higher number answers a change request. `payload` for `draft.review` is `{draft_kind (slug), title? (200), body (1 to 20000)}`, no other keys. `expires_at` and `card_id` are optional, `guardrail_reason` may be null. The relay forwards to the browser a rewritten frame: `approval_id` is the platform id, plus `inbox_item_id`, `revision`, `action_kind`, `draft_summary`, `expires_at`, `guardrail_reason`, `card_id`; never `payload`.

### SSE `input_required` (`data`)

`{input_request_id (uuid), agent_slug?, question (500), fields (at most 8: {key, type: text | choice | boolean | number, label, required, choices?}), expires_at?}`.

### `POST /internal/v1/approvals` and `/input-requests`

The same fields plus `workspace_id` and `run_id` (the platform run handle `run_<uuid>`, the `run_id` claim of the signed context). The schema is strict: `user_id` or any other key is a 422. The recipient and the sineva-ai run id are read from the platform's `chat_runs` and `conversations`. A run of another workspace is 404.

### Resume: `POST {sineva-ai}/api/v2/runs/{upstream_run_id}/resume`

Headers: `X-Internal-Api-Key`, `X-Sineva-Context` (minted as the run's owner, `run_id` is the platform handle), `Idempotency-Key` (`{approval id}:{revision}:{decision}`, or `{input request id}:{decision}`). Answer: 2xx with `{"status": "resumed" | "already_resumed"}`, bare or inside the envelope.

Approval body:

```json
{
  "kind": "approval",
  "approval_id": "5d0c6a4e-7b1f-4c2a-9e83-0f6a2b1d4c77",
  "revision": 1,
  "decision": "approved",
  "decided_at": "2026-10-22T10:05:00.000Z",
  "payload_hash": "sha256:4d2c2d80...",
  "edited": false,
  "result": { "executed": false }
}
```

`decision` is `approved`, `rejected` (optional `note`), `changes_requested` (`instruction`) or `expired`. `payload_hash` is SHA-256 of the key-sorted JSON of the decided payload; after an edit `edited` is true, `revision` is the user revision and the hash is of the edited payload. `result.executed` is always false for `draft.review`.

Input request body: `{kind: "input_request", input_request_id, decision: answered | dismissed | expired, decided_at, answers? (answered only)}`.

The path differs from the plan text (`/internal/v1/runs/{run_id}/resume`): every other sineva-ai run call is under `/api/v2/runs/`, so that form is used and is one constant to change.

## Statuses

| Status | When |
| :--- | :--- |
| 401 | No session, or a missing or wrong internal key |
| 403 | Role lacks the permission, or a bearer token for another audience |
| 404 | Not found, not visible to the role, or another workspace |
| 409 | `already_decided`, `version_conflict`, `awaiting_revision`, `not_dismissable`, or a revision out of order |
| 422 | Bad body or query, an edit to a field that is not editable, answers that do not fit the form, an unregistered `action_kind` |
| 502 | sineva-ai answered the resume badly; the item stays pending |
| 503 | sineva-ai unreachable (`run_resume_unavailable`); the item stays pending |

## Audit events

`approval.requested`, `approval.approved`, `approval.edited`, `approval.rejected`, `approval.changes_requested`, `approval.expired`, `input.requested`, `input.answered`, plus `input.dismissed` and `input.expired` (not in the PRD list, added for the two paths it has no event for). Ids, counts and field names only: never draft text, notes, instructions or answers.
