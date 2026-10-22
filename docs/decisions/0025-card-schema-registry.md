---
title: "ADR-0025: Card schema registry, validation and persistence"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-22"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "cards", "schema", "validation", "cross-service"]
summary: "Typed result cards are defined by JSON Schema 2020-12 files in packages/card-schemas, validated by the platform relay (authority) before persist and forward, stored in message_cards, and rendered through a static registry with a text fallback."
related_docs:
  - "0008-no-silent-fallbacks.md"
  - "0015-sineva-ai-owns-internal-chat-contract.md"
  - "0022-run-handle-and-sse-relay.md"
adr_id: "0025"
decision_status: "Accepted"
supersedes: []
---

# ADR-0025: Card schema registry, validation and persistence

## Status

Accepted (2026-10-22). Founder delegated: the plan's X-06 names this default and the Founder delegated its acceptance to the work package that builds it (WP-M0-32). The sineva-ai twin (validation before emit, per-specialist allowlist, byte-identical schema copy) is not written by this change.

## Context

Specialists return typed result cards (email draft, table, chart). The model must never write HTML, scripts, colors or loadable URLs (D-14, FR-SEC-13). Cards need a contract both services agree on, a safe failure mode, and a place to live after the stream ends so a reload shows the final state.

## Decision

1. **Registry is code.** `packages/card-schemas/schemas/{card_type}/v{n}.json`, one JSON Schema 2020-12 per type and integer version, `additionalProperties: false` on every object, `maxLength` on every string, `maxItems` on every array. Annotations: `x-streamable`, `x-editable`, `x-pii`, `x-origin` (`source` or `model`), `x-ttl`. Annotations are data for later work packages (patch, edit, retention); the validator only checks they are well formed.
2. **Validator.** Ajv 2020 build, strict mode, no `$data`, no remote `$ref`, no formats that fetch. Chosen over a hand-written validator because the schemas are also the cross-repo contract; chosen over Zod because the same files must be readable by Python in sineva-ai.
3. **Authority.** The platform relay validates every `card_completed` before it is persisted or forwarded. sineva-ai validates before emit, but the platform never trusts that.
4. **Rules (FR-AX-09).** At most 64 KB serialized per card and 40 cards per message. Media only as `media_ref` (opaque id pattern, never a URL). `https:` only in fields marked `x-link`, `mailto:` and `tel:` only in fields marked `x-contact`. Bidi controls and zero-width characters are stripped from every string field marked `x-sanitize` (names, subjects, addresses) before validation.
5. **Failure is a fallback, never a block.** Unknown `card_type`, unsupported version, schema failure, size, count or malformed display produce a rewritten `card_completed` with `state: "failed"`, a `rejected_code` and the `fallback_text` when one is available. The relay logs `card.rejected` with the code only. The message is never blocked.
6. **Wire shape.** `card_completed` carries `display = {card_type, schema_version, data, actions, provider, fallback_text}` (FR-AX-06, FR-AX-11). `schema_version` is an integer; a string such as `"1.0.0"` is accepted and reduced to its major. The contract fixture `sse_transcript_with_card.txt` currently carries `final_payload` instead of `display`, and its `runway_metrics` type is not in any registry. Such a frame is rejected with `display_missing`. This disagreement is reported to the sineva-ai team and not resolved here.
7. **Persistence.** Table `message_cards` (columns per PRD 19 Part 2 section 5). Rows are written when the assistant message is stored. A rejected card keeps the code only: `data` is `{}`, `fallback_text` is kept, `validation_status` is `rejected`. Patches are not stored.
8. **Versions.** The platform supports N and N-1. Older rows are upcast on read by pure functions in `packages/card-schemas/src/upcast.ts`. The set is empty today.
9. **Rendering.** `packages/ui/src/cards` holds a static object `(card_type, major) -> component`. No dynamic import from data. Only the fallback renderer exists in M0. It renders `fallback_text` as text, readable and copyable, inside an `<article>` labelled by the title.

## Consequences

- Adding a card is a schema file, a generated type and a registry entry. No card ships without all three.
- The relay keeps a small per-run counter for the 40 card cap.
- A reload shows cards from `message_cards`, not from a replay.
- sineva-ai must copy the schema files byte for byte. Until it does, the drift test is visibly skipped.

## Alternatives considered

- **Zod schemas in TypeScript.** Rejected: not consumable from Python, so no shared contract.
- **Validate only in sineva-ai.** Rejected: the browser path would trust another service's output (FR-AX-09 makes the platform the authority).
- **Drop the message when a card fails.** Rejected: FR-AX-09, a card never blocks a message.
- **Store patches.** Rejected: only the final validated state matters on reload (FR-AX-13).
