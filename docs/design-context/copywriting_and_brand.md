---
title: "Copywriting and Brand Voice"
category: "design-context"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "copywriting", "voice", "microcopy", "errors", "brand"]
summary: "Voice and microcopy for the platform UI: how interface text sounds, patterns for buttons, empty states and errors, and the copy to show for 404, 422, 500, 502 and 503."
related_docs:
  - "README.md"
  - "design_system.md"
  - "../product/product_model_and_wording.md"
  - "../decisions/0008-no-silent-fallbacks.md"
  - "../decisions/0011-user-facing-wording.md"
  - "../decisions/0016-upstream-failures-return-502-503.md"
  - "../api-spec/agents_and_chat_endpoints.md"
---

# Copywriting and brand voice

This document covers voice and microcopy. The product roster, slugs, guardrails, the @mention form and the banned words are in [product model and wording](../product/product_model_and_wording.md). Read that first; this file does not repeat it.

"Current" is what the code does. "Target" is decided but not built.

## Gotchas first

- Every string is hardcoded English in the components. There is no message catalog and no Indonesian.
- A failed call must show no reply. Never show a canned, cached or simulated answer, and never label anything a "fallback" reply ([ADR-0008](../decisions/0008-no-silent-fallbacks.md), [ADR-0016](../decisions/0016-upstream-failures-return-502-503.md)). An earlier version of this document recommended showing a "cached local simulation response" when the AI engine was down. That behavior was removed from the code and the advice is withdrawn.
- Current: error toasts print the API `message` as is. For 502 and 503 that is engine vocabulary ("The AI engine is unavailable"). For 500 it is the raw error text, which can contain internals. Map status to the copy below instead.
- The voice and style rules below come from the public site guide, `sineva-compro/docs/design/copywriting.md`. They are not repeated in an ADR here. Where this repository has no decision, follow that guide.

## Voice

Sineva sounds calm, direct and human. It says what the thing does and what the person can do next.

| Principle | Do | Avoid |
| :--- | :--- | :--- |
| Simple | Everyday words: help, reply, draft, check, save time | leverage, unlock, seamless, cutting-edge, enterprise-grade, revolutionize |
| Direct | Start with the action or the result | Long openers, small talk |
| Human | "you" and "we"; active sentences with a named actor | Passive sentences, abstract nouns, a feature that "understands" or "wants" |
| Honest | What is true today | Invented numbers, ratings, customers or percentages. With no data, show none. |
| Warm | A light touch in empty states and greetings | Jokes in errors, privacy or data-loss messages |

Style rules:

- Sentence case for buttons, headings, menus and labels.
- One idea per sentence, about 20 words at most.
- No em dash and no en dash. Use a period, comma, colon or parentheses. Write ranges as "10 to 50".
- Say "Sino" for the companion and the product name for a product. Use `@Sino` or `@SinoFinance` only where the user would type it (see the mention form in the product doc).
- No internal vocabulary in customer text: BFF, Docker, Prisma, upstream, gateway, tenant, orchestrator, 502.

## Microcopy patterns

| Situation | Pattern | Example |
| :--- | :--- | :--- |
| Button | Verb and object, 1 to 3 words, no period | `Send`, `Try again`, `Close` |
| Field label | Short noun | `Message` |
| Helper text | Why we ask, or what is allowed | `Up to 8,000 characters.` |
| Empty state | What belongs here and one first step | `Ask Sino anything, or call a product with @. Try: @SinoHelp reply to this customer.` |
| Loading | A short verb phrase, no "Please wait" | `Sending...` |
| Success | Say what happened. Skip it when the result is visible. | Show the reply, no toast |
| Validation error | What is wrong and how to fix it | `Write a message first.` |
| Server error | What happened, what to do, no blame | see the table below |

Current vs Target for a few visible strings:

| Where | Current | Target |
| :--- | :--- | :--- |
| Send button | `Send to Companion`, `Dispatching...` | `Send`, `Sending...` |
| Empty chat | "Ask a domain question below to test the Clean Architecture use case and inspect the standardized snake_case response envelope." | The empty-state pattern above |
| Input placeholder | "Ask @SinoFinance to analyze telemetry, reconcile data, or draft a playbook..." | A real request, with the mention typed by the user: `Ask Sino, or start with @SinoHelp...` |
| Network failure toast | `Network error while contacting BFF endpoint` | See the table below |
| You label | `You (Workspace Executive)` | `You` |

## Error copy

Show a fixed message per status. Do not show the API `message` or `detail`. Always give one next step. Where the toast has a Retry action (502, 503, network), keep it.

| Status | Code | Target copy | Note |
| :--- | :--- | :--- | :--- |
| network failure | (no response) | `We couldn't reach the server. Check your connection and try again.` | The browser could not complete the request. |
| 422, empty message | `VALIDATION_ERROR` on `message_text` | `Write a message first.` | |
| 422, too long | `VALIDATION_ERROR` on `message_text` | `That message is too long. Keep it under 8,000 characters.` | 8000 is the limit in `sendAgentChatDtoSchema`. |
| 404 | `RESOURCE_NOT_FOUND` | `We can't find a product called @{name}. Check the spelling, or leave out the @ and ask Sino.` | Unreachable from the current UI, which only offers known products. Becomes reachable with typed mentions. |
| 500 | `INTERNAL_SERVER_ERROR` | `Something went wrong on our side. Try again in a moment.` | Never show the raw message. |
| 502 | `UPSTREAM_ERROR` | `Sino couldn't finish that request. Try again in a moment.` | The engine answered, but not with a usable reply. A reworded message will not help, so do not suggest one. |
| 503 | `UPSTREAM_UNAVAILABLE` | `Sino isn't answering right now. Try again in a moment.` | The engine was unreachable or too slow. |

- Name a product only when one was addressed: `@SinoFinance isn't answering right now.` Otherwise say Sino.
- Open decision: a 503 can follow a turn the engine did complete, and there is no idempotency key. Whether the 503 copy should warn that the first message may have gone through needs a product decision.
- The message the user typed stays in the transcript, and no reply line is added. Do not render an error as if it were a reply from Sino.
- The 502 and 503 codes and meanings are in [agents and chat endpoints](../api-spec/agents_and_chat_endpoints.md).

## Names

Company and product names, the six products, handles and guardrails are in the [product doc](../product/product_model_and_wording.md). For public copy, the site guide also says: write "Sineva" for the company and never "Sineva Tech", and never describe Sino as a mascot.

## Indonesian

Not present in the UI today. When added: "teman kerja" or "teman AI" for Sino, formal "Anda", sentence case, and the same rules as above. Use the Indonesian copy in `sineva-compro` as the reference; do not translate word for word.

## Related

[Product model and wording](../product/product_model_and_wording.md), [design system](design_system.md), [ADR-0011](../decisions/0011-user-facing-wording.md), [ADR-0016](../decisions/0016-upstream-failures-return-502-503.md).
