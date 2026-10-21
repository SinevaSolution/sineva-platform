---
title: "ADR-0012: Canonical product slugs, SinoFinance rename and guardrails"
category: "decisions"
status: "active"
version: "1.1.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "product", "slugs", "guardrails", "cross-service"]
summary: "Six product slugs are fixed across repositories, SinoMoney becomes SinoFinance, and each product has a behavior limit that code and copy must respect."
related_docs:
  - "0010-one-chat-with-mentions.md"
  - "0011-user-facing-wording.md"
  - "0013-internal-service-auth-header.md"
  - "0014-uuid-primary-keys.md"
  - "../product/product_model_and_wording.md"
adr_id: "0012"
decision_status: "Accepted"
supersedes: []
---

# ADR-0012: Canonical product slugs, SinoFinance rename and guardrails

## Status

Accepted (2026-10-21). Implemented in both repositories.

Cross-service: mirrored in sineva-ai `docs/decisions/` (a sineva-ai ADR of the same title; that folder does not exist yet, so no number is cited). Change both repos together.

## Context

The same product appeared under different identifiers in different places. This platform used hyphenated slugs (`sino-finance`), `sineva-ai` used underscored ones (`sino_finance`), and `sineva-compro` uses unseparated ones. The finance product was also called SinoMoney in places. A slug is a routing key in `/api/v1/agents/{agent_slug}/chat`, so a mismatch is a failed request, not a typo.

## Decision

Canonical slugs, matching `sineva-compro`:

| Product | Slug | Mention |
| :--- | :--- | :--- |
| SinoPeople | `sinopeople` | `@SinoPeople` |
| SinoFinance | `sinofinance` | `@SinoFinance` |
| SinoSales | `sinosales` | `@SinoSales` |
| SinoSocial | `sinosocial` | `@SinoSocial` |
| SinoHelp | `sinohelp` | `@SinoHelp` |
| SinoInsights | `sinoinsights` | `@SinoInsights` |

- Slugs are lowercase with no separator. Do not use `sino-*` or `sino_*` in new code, data, tests or docs.
- SinoMoney is renamed SinoFinance everywhere.
- The platform is aligned: `prisma/seed.ts`, the OpenAPI spec and the fixtures use the canonical slugs.
- `sineva-ai` has migrated. Its agent catalog (`agentic/agents/specialists.py`), its router (`agentic/agents/orchestrator.py`) and its seed knowledge documents use the same six slugs.
- The orchestrator in `sineva-ai` has the slug `sino`. It is Sino itself, not a seventh product, and a request to `sino` is routed to a product. Handles keep their casing (`@SinoFinance`).

Guardrails, which every implementation and every line of copy must respect:

- SinoPeople never hires or rejects anyone.
- SinoSales proposals and SinoSocial posts are drafts until a person approves them.
- SinoFinance never moves money.
- SinoInsights is read-only.
- SinoHelp replies automatically to routine questions within rules the user sets, and escalates new, sensitive or uncertain ones to a person.

## Consequences

- One identifier per product across the web, the platform, the AI engine and the marketing site.
- Fixtures, seed data and tests that contain old slugs change in the same change that introduces the canonical ones.
- Existing databases need a manual step. `prisma/seed.ts` upserts by `agent_slug`, so re-seeding a database that was seeded with the old `sino-*` slugs adds six canonical rows and leaves the six old rows in `platform.agent_configs`, which then show up in `GET /api/v1/agents`. Remove or rename them with a manual or data migration. A fresh database is not affected.
- The platform registry holds the six product slugs and no `sino` row, and `SendAgentMessageUseCase` looks the slug up there first. Inference from the use case and the seed, not run against a database: `POST /api/v1/agents/sino/chat` returns 404 from the platform today, although `sineva-ai` would accept it. How the single chat reaches the orchestrator is open ([ADR-0010](0010-one-chat-with-mentions.md)).
- Guardrails are product constraints, not UI hints: a feature that bypasses approval or acts on money or hiring decisions violates this decision, whatever the UI shows.
- Copy that implies a product acts beyond its guardrail (for example "SinoFinance pays your invoices") is a defect ([ADR-0011](0011-user-facing-wording.md)).

## Alternatives considered

- Keep per-repository slugs and translate at the boundary. Rejected: every boundary needs a mapper, and a missed mapping silently breaks routing.
