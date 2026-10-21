---
title: "ADR-0011: User-facing wording"
category: "decisions"
status: "active"
version: "1.1.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "copy", "wording", "brand", "product"]
summary: "User-facing copy calls Sino a companion, never a chatbot, assistant or agent, while code identifiers and API paths keep the word agent."
related_docs:
  - "0010-one-chat-with-mentions.md"
  - "0012-canonical-product-slugs-and-guardrails.md"
  - "../product/product_model_and_wording.md"
  - "../design-context/copywriting_and_brand.md"
adr_id: "0011"
decision_status: "Accepted"
supersedes: []
---

# ADR-0011: User-facing wording

## Status

Accepted (2026-10-21).

Cross-service: mirrored in sineva-ai `docs/decisions/` (a sineva-ai ADR of the same title; that folder does not exist yet, so no number is cited). Change both repos together.

## Context

Product copy that calls the suite a chatbot, assistant or agent sets the wrong expectation. The code and API already use "agent" (`/api/v1/agents`, `AgentEntity`, `agent_slug`), and renaming those would break the contract ([ADR-0003](0003-snake-case-wire-contract.md)).

## Decision

User-facing copy means anything a customer reads: UI text, marketing pages, emails, error messages, empty states, notifications.

- Never write "chatbot".
- Sino is a "companion". In Indonesian: "teman kerja" or "teman AI".
- Never call Sino "assistant", "asisten" or "agent" in user-facing copy.
- The suite is one chat. The user talks to Sino and calls a product by @mention, `@SinoHelp …`, with no comma ([ADR-0010](0010-one-chat-with-mentions.md)).
- Integrations are described generically ("the tools you already use"). Do not name specific platforms.
- SinoMoney is now SinoFinance ([ADR-0012](0012-canonical-product-slugs-and-guardrails.md)).

Not covered by this rule: code identifiers, file names, route paths, JSON keys, OpenAPI text, and developer documentation. These keep "agent" where it is the existing technical term.

## Consequences

- Copy review has a checkable list. Search new UI strings for the banned words.
- Some surfaces show both vocabularies side by side (a route named `/agents`, a UI label "companion"). That is intended.
- Existing seed data and UI strings that violate this are fixed when touched. Flag them rather than rewriting unrelated files.

## Alternatives considered

- Rename code and API to "companion". Rejected: it changes a published contract for a copy concern.
- Allow "assistant" as a synonym. Rejected by the Founder.
