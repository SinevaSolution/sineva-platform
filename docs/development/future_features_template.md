---
title: "Future Features Template"
category: "development"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "template", "feature-spec", "rfc", "adr"]
summary: "A template for proposing a feature in sineva-platform, with sections for guardrails and wording, database migration, contract impact with sineva-ai, failure behavior without silent fallbacks, and the ADR link."
related_docs:
  - "roadmap.md"
  - "feature_development_workflow.md"
  - "known_issues_and_tech_debt.md"
  - "../governance/agent_rules.md"
  - "../decisions/README.md"
  - "../product/product_model_and_wording.md"
---

# Future features template

Use this before building anything that changes a contract, the database schema, a product's behavior, identity or the way a failure is shown. Small fixes and refactors do not need it.

Where it goes: the issue or the pull request description. If the feature makes a decision that others must follow (a contract, a data model, a guardrail), the decision becomes an ADR in [decisions](../decisions/README.md) and the proposal links to it. Do not create a proposals folder.

"Current" is what the code does. "Target" is decided but not built.

## Gotchas before you write

- Check [known issues and tech debt](known_issues_and_tech_debt.md) for the area. Do not build on an item listed there. Identity from the request body (SEC-2) and the in-memory cache (INF-1) are the usual traps.
- The chat contract belongs to `sineva-ai` ([ADR-0015](../decisions/0015-sineva-ai-owns-internal-chat-contract.md)). A change starts there.
- Do not write a fallback section. A failure is shown as a failure ([ADR-0008](../decisions/0008-no-silent-fallbacks.md)).
- Say "Target" for what does not exist, and "Current" for what does. Cite files and symbols, not line numbers.
- Do not invent numbers. A success measure needs a real source, or say none exists yet.

## Template

````markdown
---
title: "Feature: <title>"
category: "development"
status: "draft"
version: "0.1.0"
last_updated: "YYYY-MM-DD"
owner: "<author>"
tags: ["sineva", "feature-spec"]
summary: "<one sentence: what changes and for whom>"
related_docs:
  - "<path to the doc or ADR this builds on>"
---

# Feature: <title>

## 1. Problem and who it is for
- Who hits this today, and what they do instead.
- Products involved (SinoPeople, SinoFinance, SinoSales, SinoSocial, SinoHelp, SinoInsights, or Sino itself).
- How we will know it worked. A real measure with its source, or "none yet".

## 2. Guardrail and wording impact
- Guardrails (R-34). For each product the feature touches, say how it stays inside its line:
  - SinoPeople never hires or rejects.
  - SinoSales proposals and SinoSocial posts stay drafts until a person approves.
  - SinoFinance never moves money.
  - SinoInsights is read-only.
  - SinoHelp auto-replies to routine questions within user-set rules, and escalates new, sensitive or uncertain cases to a person.
- Does any new tool or route let a product send, publish, pay, hire or reject? If yes, where is the approval step? An ADR is required.
- New user-facing strings, and the wording check (R-33, R-35, R-36, R-37): no chatbot, assistant or agent; @mention with no comma; canonical slugs; integrations described generically. List the strings.

## 3. Architecture impact
One line per layer, or "none".
- domain (entities, ports, errors):
- application (use cases, DTOs):
- infrastructure (adapter, config):
- http and app (routes, response):
- client and shared (components, store, view types and their contract guards):

## 4. API contract
- Method, path, request schema with constraints, success response with a real example.
- Every status the route can return: 401, 403, 404, 409, 422, 500, 502, 503 as they apply.
- Breaking change to the public API? Who consumes it, and how do they migrate?
- OpenAPI entry to add or change in `spec.ts` (R-25).

## 5. Contract impact with sineva-ai
- Does the internal request or response change? If yes, the change starts in `sineva-ai`: new fixtures there, copied here byte for byte (R-40), and both repositories change together.
- Header, `tenant_id`, `session_id` and `user_id` handling. Where does identity come from (R-27)?
- Gateway Zod schema, `ChatReplyView` and OpenAPI changes.
- If sineva-ai is not involved, write "none".

## 6. Database migration plan
- Tables and columns added or changed, in schema `platform`, with `id` as a UUID primary key and `snake_case` names (R-17, R-21, R-39).
- Created with `prisma migrate dev` on a throwaway database only. The migration SQL is committed (R-19, R-20).
- Applied to shared and production databases with `prisma migrate deploy` and `?schema=platform` (R-42). Never `reset` or `db push` there (R-18).
- Data backfill or rename of existing rows, and who runs it.
- Rollback: what to do if the migration is wrong after deploy.
- If there is no schema change, write "none".

## 7. Failure behavior (no silent fallback)
One row per way this can fail. No cached, canned or invented result.

| Failure | What the caller gets (status, code) | What the user sees | What is logged |
| :--- | :--- | :--- | :--- |
| dependency down or slow | | | |
| invalid input | | | |
| not found or conflict | | | |
| sineva-ai non-2xx or invalid body | 502 `UPSTREAM_ERROR` | | |
| sineva-ai unreachable | 503 `UPSTREAM_UNAVAILABLE` | | |

- Is the call safe to retry? If not (for example a chat turn), say what prevents a double run.
- Typed domain errors only. No empty `catch` (R-26).

## 8. Security and identity
- Who may call this, and how that is checked server-side.
- What data leaves the system, and what is logged (no user text, no secrets).
- New secrets: how they are provided, with no default value (R-28).

## 9. UI states and accessibility
- Loading, error, empty and not-found states (R-31).
- Keyboard use, visible focus, contrast in both themes, 44 px targets (R-32).
- Copy for each state, written against [copywriting and brand](../design-context/copywriting_and_brand.md).

## 10. Test plan (test first, R-01)
- [ ] Unit tests with fakes (use cases, DTOs). Show the red run.
- [ ] Route tests for every status in section 4.
- [ ] Contract tests against the `sineva-ai` fixtures, if section 5 applies.
- [ ] Integration tests against a throwaway Postgres, if section 6 applies.
- [ ] Architecture test still passes (layer rules).
- [ ] `npm run lint && npm run typecheck && npm run test && npm run build`, plus `npm run test:integration` for database code (R-02).

## 11. Docs to update (R-38)
- API docs, OpenAPI, product doc, design docs, `known_issues_and_tech_debt.md` (add or remove items), the docs index.

## 12. Decision record and open questions
- ADR: link the new or related ADR, or "none needed" with the reason.
- Open questions that block the work, and who decides.

## 13. Rollout
- Order of deployment across the platform and `sineva-ai`.
- How to turn it off, if it can be.
````

## Related

[Roadmap](roadmap.md), [feature development workflow](feature_development_workflow.md), [agent rules](../governance/agent_rules.md), [decisions](../decisions/README.md).
