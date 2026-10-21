---
title: "Product Model and Wording"
category: "product"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "product", "wording", "guardrails", "mention", "slugs", "copy"]
summary: "One chat with Sino, six products called by @mention, each with a canonical slug and a guardrail, the wording rules in English and Indonesian, and the places where the code still breaks them."
related_docs:
  - "README.md"
  - "../decisions/0010-one-chat-with-mentions.md"
  - "../decisions/0011-user-facing-wording.md"
  - "../decisions/0012-canonical-product-slugs-and-guardrails.md"
  - "../design-context/copywriting_and_brand.md"
  - "../api-spec/agents_and_chat_endpoints.md"
  - "../development/known_issues_and_tech_debt.md"
---

# Product model and wording

"Current" is what the code does. "Target" is decided but not built.

## Gotchas first

- The decision (one chat, @mention) is not built. Current UI: a card per product and a separate transcript per product. The user does not type a mention; clicking a card sets the target.
- Sino is the companion. SinoFinance and the other five are products of the suite, not separate companions. Existing UI text and API messages still call each product a "companion".
- "Agent" stays in code, route paths, JSON keys, OpenAPI and developer docs. It never appears in text a customer reads.
- The guardrails are product limits, not UI hints. The platform proxies chat and has no write tools, so it does not enforce them today. Whether `sineva-ai` enforces them was not verified.
- The R-36 check (`@Sino[A-Za-z]+,`) also matches comma-separated lists of handles. Read each hit before calling it a violation.
- The platform UI is English only today. No Indonesian strings exist in this repository; the Indonesian terms below are the rule for when they do.

## One chat

The suite is one conversation. The user talks to Sino. To use a product, the user calls it by @mention at the start of the request ([ADR-0010](../decisions/0010-one-chat-with-mentions.md)). Products are capabilities of the suite that Sino calls on. Separate per-product threads are not the primary interface.

### @mention syntax

`@` + the product name + one space + the request. No comma, no colon.

| Do | Don't |
| :--- | :--- |
| `@SinoHelp reply to this customer` | `SinoHelp, reply to this customer` |
| `@SinoSales draft a follow-up for this lead` | `@SinoSales, draft a follow-up for this lead` |
| `@SinoFinance check this month's spending against the budget` | `Hey SinoFinance can you check...` |
| `@Sino what can you do with a support inbox?` (no product named) | `@Sino Assistant ...` |

Indonesian, same form: `@SinoHelp balas pelanggan ini`, `@SinoSales buatkan draf tindak lanjut untuk prospek ini`, `@SinoFinance periksa pengeluaran bulan ini terhadap anggaran`.

- Start the request with a verb (reply, draft, check, summarize, prepare) or "tell me" / "show me", so it reads as an instruction.
- Sino's replies name a product without `@`: "SinoFinance checked the budget."
- These two style rules come from the public site guide, `sineva-compro/docs/design/copywriting.md` (section 1, rule 6), not from an ADR in this repository. ADR-0010 fixes only the no-comma form.
- Current: no code parses mentions. `handle` (for example `@SinoFinance`) is a field returned by `sineva-ai`, and the chat route takes the product from the URL slug. Target: the chat UI parses the mention and picks the product; with no mention it goes to Sino (the orchestrator, slug `sino` in `sineva-ai`). The platform does not register `sino` today, so `POST /api/v1/agents/sino/chat` returns 404. See the [roadmap](../development/roadmap.md).

## Products

Slugs and handles are fixed across repositories ([ADR-0012](../decisions/0012-canonical-product-slugs-and-guardrails.md)). Slugs are lowercase with no separator. Do not write `sino-finance`, `sino_finance` or `SinoMoney`.

| Product | Slug | Handle | Platform `category` | Purpose (one line) | Guardrail |
| :--- | :--- | :--- | :--- | :--- | :--- |
| SinoPeople | `sinopeople` | `@SinoPeople` | `people_hr` | HR and people operations: employee policies, time off, onboarding, workforce planning | Never hires or rejects anyone |
| SinoFinance | `sinofinance` | `@SinoFinance` | `finance_ops` | Budgeting and forecasting, burn rate, cash runway, expense policy, procurement control | Never moves money |
| SinoSales | `sinosales` | `@SinoSales` | `sales_growth` | Revenue work: pipeline qualification and deal strategy | Proposals stay drafts until a person approves |
| SinoSocial | `sinosocial` | `@SinoSocial` | `social_marketing` | Brand voice and multi-channel social campaigns | Posts stay drafts until a person approves |
| SinoHelp | `sinohelp` | `@SinoHelp` | `customer_support` | Support triage, incident severity, escalation against service targets | Auto-replies to routine questions within rules the user sets; escalates new, sensitive or uncertain cases to a person |
| SinoInsights | `sinoinsights` | `@SinoInsights` | `data_insights` | Business intelligence: executive KPIs, retention cohorts, anomaly detection | Read-only |

- Purposes are paraphrased from `role_summary` in `sineva-ai/src/sineva_ai/agentic/agents/specialists.py`. They are internal descriptions, not approved marketing copy.
- `category` is the enum in `server/application/dtos/agent_dto.ts`, stored in `agent_configs.category`. The orchestrator `sino` has no platform category.
- The six slugs are the seed rows in `apps/web/prisma/seed.ts`. A database seeded earlier with `sino-*` slugs keeps the old rows; the seed upserts by slug and never removes them (see [known issues](../development/known_issues_and_tech_debt.md)).

## Guardrails

A guardrail is a limit on what the product does, whatever the UI shows. A feature that bypasses approval, or acts on money or a hiring decision, violates [ADR-0012](../decisions/0012-canonical-product-slugs-and-guardrails.md) (R-34).

- SinoPeople: it can prepare, summarize and answer policy questions. A person hires, rejects, promotes or dismisses.
- SinoFinance: it analyzes and drafts. It does not pay, transfer, approve a payment or change a ledger.
- SinoSales and SinoSocial: it writes drafts. Sending a proposal or publishing a post needs a person's approval first.
- SinoInsights: it reads and reports. It writes no data back.
- SinoHelp: it answers routine questions by itself, only within rules the user set. New, sensitive or uncertain cases go to a person.

For code: a new tool or route that gives a product a write action (send, publish, pay, hire, reject) needs an approval step in the flow and an ADR. For copy: do not write a sentence that implies a product acts beyond its line ("SinoFinance pays your invoices").

Current: nothing in the platform enforces a guardrail. The only defense is that the platform has no tool that performs these actions. If a tool is added in `sineva-ai`, check it against this list.

## Wording

User-facing text means anything a customer reads: UI text, marketing pages, emails, error messages, empty states, notifications ([ADR-0011](../decisions/0011-user-facing-wording.md)). It does not cover identifiers, file names, route paths, JSON keys, OpenAPI text or developer docs.

| Topic | Write (EN) | Write (ID) | Never write |
| :--- | :--- | :--- | :--- |
| What Sino is | companion | teman kerja, teman AI | chatbot, bot, assistant, agent; ID: asisten (and chatbot, bot, agent). Also avoid "pembantu" in Indonesian: it reads as a domestic helper |
| What the six are | products, or the product name | produk, atau nama produknya | "agents", "bots", "assistants" |
| Finance product | SinoFinance | SinoFinance | SinoMoney |
| Calling a product | `@SinoHelp reply to this customer` | `@SinoHelp balas pelanggan ini` | `SinoHelp, reply...`, `@SinoHelp, reply...` |
| Product actions | drafts, prepares, suggests, flags, summarizes | membuat draf, menyiapkan, menyarankan, menandai, merangkum | hires, rejects, pays, transfers, publishes on its own |
| Integrations | the tools you already use | alat yang sudah Anda pakai | a named platform, unless a real, shipped integration exists and the Founder approved the claim |
| Where "agent" is fine | code, `/api/v1/agents`, `agent_slug`, OpenAPI, developer docs | same | customer text |

The Indonesian terms for Sino are fixed by the Founder. Other Indonesian phrasing follows `sineva-compro` (formal "Anda"); check there before inventing a sentence. The "pembantu" and "never call Sino a mascot" rules come from `sineva-compro/docs/design/copywriting.md`.

Generic integrations (R-35): write "the tools you already use". A platform name in copy promises an integration that may not exist. This applies to customer tools (social networks, CRMs, chat apps). Internal infrastructure names are a separate problem: they are jargon for a customer, see the violations below.

SinoMoney was renamed SinoFinance. Use only SinoFinance in code, data, tests, copy and docs, except where a doc discusses the old name. R-37's check: `grep -rnE "sino[-_](people|finance|sales|social|help|insights)|SinoMoney|sino[-_]?money" apps docs`.

## Copy review checklist

Run this on every new or changed customer-facing string.

1. Banned words: none of chatbot, bot, assistant, asisten, agent in customer text (R-33). `grep -rniE "chatbot|assistant|asisten|\bbots?\b|\bagents?\b"` on the strings, then ignore identifiers and comments.
2. Sino is a companion; the six are products.
3. Every example of a chat line opens with `@Product`, one space, a verb, no comma (R-36).
4. Names and slugs are canonical. No `SinoMoney`, no `sino-*` or `sino_*` (R-37).
5. No sentence implies a product goes beyond its guardrail (R-34).
6. Integrations are generic (R-35).
7. No invented number, customer, rating or claim. A number needs a real source; with no data, show none.
8. No internal vocabulary: BFF, Docker, Prisma, upstream, 502, tenant, orchestrator. Say what happened and what the person can do.
9. Dashes: no em dash and no en dash. This is the rule of the public site guide; apply it here unless the Founder says otherwise.
10. Read it aloud. It should sound like a person wrote it.

## Current violations

Verified by reading the code on 2026-10-21. Fix them when the file is next touched; do not copy them. R-33's own grep (`chatbot|assistant|asisten` under `src/client` and `src/app`) finds nothing.

Banned words in visible text:

- `client/components/sineva_dashboard.tsx`: "6 Specialized Agents" (the Active Companions stat).
- `client/components/command_palette.tsx`: "Enable Autonomous Multi-Agent Handoff" (label), plus the search value "Switch to Autonomous Multi-Agent Handoff".

Model and structure (ADR-0010):

- Per-product sessions: "@SinoFinance Interactive Session", "Select Companion", "Active Companion", "Start a thread with @SinoFinance". The six products are called "Specialized AI Companions" (dashboard heading and palette group), which makes each product look like its own companion.
- Input placeholder "Ask @SinoFinance to analyze telemetry, reconcile data, or draft a playbook...": the target is preset, and the text is generic.

Product claims in seed copy (`apps/web/prisma/seed.ts`, shown on the cards):

- SinoPeople: "Automates candidate screening" and the capability `candidate_cv_scoring` sit next to the "never hires or rejects" line. Needs a wording decision.
- SinoSocial: "adapts technical launches for LinkedIn/X" names platforms (R-35). "Orchestrates high-converting editorial calendars" is a claim with no source.
- SinoHelp: "maintains 99.4% SLA adherence" is an unsourced number. "Resolves complex technical tickets" does not mention the rules-and-escalation limit.
- SinoSales: "hyper-personalized executive sequences" and "predicts pipeline conversion probability" are claims with no source.

Invented numbers and statuses in the UI:

- "342 ms" Median BFF Latency, "All Systems Nominal", "100% Internal AI Mesh". The status pills are hardcoded `online` or `standby` and do not read `/api/v1/health`.
- The token budget (`1,391,250 / 5,000,000`) is the initial Redux state in `workspace_slice.ts`, not data. "All Companions (6)" and the count "6" are hardcoded.
- The per-card latency, session count and token numbers are seed values.

Internal vocabulary in customer-facing text:

- "v1.0 Platform BFF", "Clean Architecture · Next.js 16", "snake_case API Standard", "isolated internal Docker bridge", "Test SeaweedFS S3 Presign API", "Dispatching...", "Network error while contacting BFF endpoint", "You (Workspace Executive)".
- The empty-state text says "test the Clean Architecture use case and inspect the standardized snake_case response envelope".

Wrong labels:

- "Open Swagger UI (/api-docs)" in the palette and "Explore full Swagger UI" in the dashboard. `/api-docs` is a static view.

Metadata (`app/layout.tsx`):

- The title contains an em dash and "BFF". The description's comma-separated handle list is fine, but R-36's regex flags it.

Language: English only; no Indonesian strings.

## Related

[Copywriting and brand](../design-context/copywriting_and_brand.md) for voice and error copy, [agents and chat endpoints](../api-spec/agents_and_chat_endpoints.md), [known issues and tech debt](../development/known_issues_and_tech_debt.md), [ADR-0010](../decisions/0010-one-chat-with-mentions.md), [ADR-0011](../decisions/0011-user-facing-wording.md), [ADR-0012](../decisions/0012-canonical-product-slugs-and-guardrails.md).
