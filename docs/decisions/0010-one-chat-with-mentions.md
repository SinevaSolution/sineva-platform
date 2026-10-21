---
title: "ADR-0010: One chat, products called by @mention"
category: "decisions"
status: "active"
version: "1.1.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "product", "ux", "chat", "mention"]
summary: "The suite is a single conversation with Sino, and the user calls a product by @mention instead of opening a separate thread per product."
related_docs:
  - "0011-user-facing-wording.md"
  - "0012-canonical-product-slugs-and-guardrails.md"
  - "../product/product_model_and_wording.md"
  - "../design-context/ux_and_frontend_libraries.md"
adr_id: "0010"
decision_status: "Accepted"
supersedes: ["docs/research/ux_agentic_interfaces.md (removed): its recommendation of one thread per companion"]
---

# ADR-0010: One chat, products called by @mention

## Status

Accepted (2026-10-21). Supersedes the per-companion-thread recommendation of the earlier UX research note (`docs/research/ux_agentic_interfaces.md`, removed in the same change).

Cross-service: mirrored in sineva-ai `docs/decisions/` (a sineva-ai ADR of the same title; that folder does not exist yet, so no number is cited). Change both repos together.

## Context

The earlier research note argued for a separate conversation thread per product. Its case was context pollution: mixing HR drafts with financial modeling in one thread degrades both the prompts and the user's mental model. It stored history per product (`chat_history_by_agent[agent_slug]`).

That framing treats each product as a separate assistant the user must switch between. The product model is different. Sineva is one companion, Sino, and the products (SinoPeople, SinoFinance, SinoSales, SinoSocial, SinoHelp, SinoInsights) are capabilities of the suite that Sino calls on.

## Decision

- The suite is one chat. The user talks to Sino.
- To use a specific product, the user calls it by @mention at the start of the request, with no comma: `@SinoHelp reply to this customer`.
- Product handles and slugs are defined in [ADR-0012](0012-canonical-product-slugs-and-guardrails.md). Wording rules are in [ADR-0011](0011-user-facing-wording.md).
- Separate per-product threads are not the primary interface.

## Consequences

- Users do not choose a destination before they type. They write the request and name a product when they want one.
- The context-pollution risk from the old note remains real. Mitigations (per-mention context handling, clear attribution of which product answered) are design work not yet specified here. Do not assume they exist.
- Open follow-up: the current API and schema are shaped around per-product sessions. `POST /api/v1/agents/{agent_slug}/chat`, `chat_sessions.agent_slug` and `chat_messages.agent_slug` (in `apps/web/prisma/schema.prisma`) and the client store's per-agent history all key conversations by product. How a single chat maps onto these needs its own design before the chat UI is rebuilt. Until then, treat them as current structure, not as confirmation of per-product threads.
- Code identifiers and the `/api/v1/agents` path keep the word "agent" ([ADR-0011](0011-user-facing-wording.md)).

## Alternatives considered

- One thread per product (the earlier recommendation). Reversed by the Founder: it presents the suite as several assistants instead of one companion.

## Origin

Replaces `docs/research/ux_agentic_interfaces.md`. Dropped from that note: the "< 150ms" switching claim and the `delegated_tools` telemetry field, which are not backed by code in this repository. The ⌘K palette and transparent-telemetry ideas are design topics and belong in [UX and frontend libraries](../design-context/ux_and_frontend_libraries.md), not in this decision.
