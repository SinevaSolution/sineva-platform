---
title: "Product"
category: "product"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "product", "index", "wording", "guardrails"]
summary: "Index of the product docs: the one-chat model, the six products with slugs and guardrails, and the wording rules for anything a customer reads."
related_docs:
  - "product_model_and_wording.md"
  - "../README.md"
  - "../decisions/0010-one-chat-with-mentions.md"
  - "../decisions/0011-user-facing-wording.md"
  - "../decisions/0012-canonical-product-slugs-and-guardrails.md"
---

# Product

This folder states what the product is and how we talk about it: one chat with Sino, six products called by @mention, the limit each product must respect, and the words allowed in user-facing text. It does not hold visual design (see [design context](../design-context/README.md)), API shapes ([api-spec](../api-spec/README.md)), or roadmap items ([development](../development/README.md)).

| File | What it covers | Read it when |
| :--- | :--- | :--- |
| [product_model_and_wording.md](product_model_and_wording.md) | One chat and @mention syntax, the product roster with slugs and guardrails, wording do and don't in English and Indonesian, a copy review checklist, and the violations that exist in code today | You write or review any text a customer reads, add or rename a product, or build the chat UI |

## Reading order

1. [product_model_and_wording.md](product_model_and_wording.md) top to bottom once.
2. [ADR-0010](../decisions/0010-one-chat-with-mentions.md), [ADR-0011](../decisions/0011-user-facing-wording.md) and [ADR-0012](../decisions/0012-canonical-product-slugs-and-guardrails.md) for the reasons.
3. [Copywriting and brand](../design-context/copywriting_and_brand.md) for tone and microcopy.

## Related

- Rules: R-33 (wording), R-34 (guardrails), R-35 (generic integrations), R-36 (@mention form), R-37 (canonical slugs). See [agent rules](../governance/agent_rules.md).
- Folders: [design-context](../design-context/README.md) for voice and microcopy, [api-spec](../api-spec/README.md) for the chat route, [development](../development/README.md) for the known violations list.
