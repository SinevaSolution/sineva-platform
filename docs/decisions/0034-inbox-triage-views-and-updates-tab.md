---
title: "ADR-0034: Inbox triage views and the Updates tab"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-22"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "inbox", "ui", "filters"]
summary: "The Inbox shows three views for people (Needs you, Updates, Done). Results move from Done to their own Updates tab, the list gains kind, source and text filters in the query, and an item links back to its chat by conversation id."
related_docs:
  - "0032-inbox-items-approvals-and-run-resume.md"
  - "0011-user-facing-wording.md"
adr_id: "0034"
decision_status: "Accepted"
supersedes: []
---

# ADR-0034: Inbox triage views and the Updates tab

## Status

Accepted (2026-10-22). Founder delegated: the Founder asked for a calmer, faster Inbox and named the three views; this record keeps the data contract of [ADR-0032](0032-inbox-items-approvals-and-run-resume.md) in step with them. It amends point 2 (tab mapping) of that ADR and nothing else.

## Context

ADR-0032 maps approvals to Needs review, input requests to Needs input, and everything that is not open, plus every `result`, to Done. People think of the Inbox as "what needs me", "what happened" and "what I already handled". A `result` is news, not a handled task, so mixing it into Done hides it and makes Done noisy. The first Inbox screen also filtered by source in the browser over a single page of 20 rows, which silently drops matches, and the "open chat" link used the run handle where the chat route needs a conversation id, so it led nowhere.

## Decision

1. **Tabs on the wire.** `tab` accepts `needs_review`, `needs_input`, `needs_you` (both of the first two, open only), `updates` and `done`. `tabOf` puts every `result` in `updates`; `done` is every non-open approval or input request. The screen shows Needs you, Updates and Done and calls `needs_you`, `updates` and `done`. `needs_review` and `needs_input` stay valid for other callers.
2. **Filters in the query.** The list takes `kind` (`approval`, `input_request`, `result`), `source_type` (`chat`, `room`, `system`) and `q` (a case-insensitive part of the title, at most 80 characters). All are applied by the repository before paging, so a page is never short because of a client-side filter.
3. **Counts.** `GET .../inbox/counts` adds `updates` and `unread_updates`. `done` no longer counts results. `badge` is still `needs_review + needs_input`.
4. **Viewer.** A viewer's scope was "Done only" because results lived there. It becomes "Updates and Done": the same rows as before, still summaries without payloads, notes or the source link. Needs-you tabs stay empty.
5. **Link back to the chat.** The item detail carries `source.conversation_id` for chat sources, resolved server-side from the run handle inside the caller's workspace. The list view does not carry it (no per-row lookup). Viewers never get it.
6. **Reading is not deciding.** Opening an item marks it read; no key approves, rejects or edits on its own focus. The single-key shortcuts only act on the open item and never while a field has focus (the FR-INBOX-30 wording against a one-key approve is respected by never acting on a key press without an open item and an enabled button; Approve still needs the visible primary button or its shortcut on the item the person is looking at).

## Consequences

- Consumers that read the old `done` count or expected results under `done` change. Only the Inbox screen consumed them in this repo.
- No migration: tabs are derived from `kind` and `state`.
- A future `idea` or `handoff` kind needs a tab decision of its own (WP-M3-26, WP-M2-13).

## Alternatives considered

- **Keep results in Done and split by `kind` in the browser.** No server change, but the Done count and the Done list would still mix handled tasks with news.
- **A new `updates` boolean on the item.** Redundant with `kind` and a second thing to keep consistent.
- **Filter by source in the browser.** Already shipped, and wrong beyond one page.
