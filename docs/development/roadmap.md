---
title: "Roadmap"
category: "development"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "roadmap", "hardening", "planning", "one-chat"]
summary: "What is real and what is a stub in sineva-platform today, and the ordered work that follows: hardening first, then the one-chat product, then ideas that are not committed."
related_docs:
  - "known_issues_and_tech_debt.md"
  - "feature_development_workflow.md"
  - "future_features_template.md"
  - "../governance/agent_rules.md"
  - "../decisions/0010-one-chat-with-mentions.md"
  - "../decisions/0015-sineva-ai-owns-internal-chat-contract.md"
---

# Roadmap

The order of work, and the evidence that says an item is done. There are no dates: none have been decided, and a date written here would be a guess. Items link to [known issues and tech debt](known_issues_and_tech_debt.md) by ID.

"Current" is what the code does. "Target" is decided but not built.

## Gotchas first

- The earlier version of this roadmap marked Phase 1 "Completed". It was not: the platform has no authentication, a fake cache, fake health values and a console UI that is not the one-chat product. This version replaces it.
- Security comes before features. Several features (chat history, per-user data) are unsafe to build while identity comes from the request body.
- Anything that changes the public API or the data model needs an ADR first, and anything that changes the chat contract starts in `sineva-ai` ([ADR-0015](../decisions/0015-sineva-ai-owns-internal-chat-contract.md)).

## Current state

What works, with the evidence:

| Area | State | Evidence |
| :--- | :--- | :--- |
| Routes | Five routes with Zod validation, the shared envelope and typed errors (404, 409, 422, 502, 503) | `src/__tests__/api_routes.test.ts` |
| Agent registry | Prisma 7.10.1 repository on schema `platform`, migration `20261021013412_init`, seed with the six products | `src/__tests__/integration/prisma_agent_repository.int.test.ts` (needs a throwaway Postgres) |
| AI gateway | Real contract with `sineva-ai`: `X-Internal-Api-Key`, `user_message`, Zod check of the envelope, 502 and 503, no fallback | `src/__tests__/contract/internal_ai_engine_gateway.contract.test.ts`. Not run against a live `sineva-ai` in this pass. |
| Layering | Import rules enforced by ESLint and a test | `src/__tests__/architecture.test.ts` |
| API docs | OpenAPI 3.1 document and a static `/api-docs` page | [swagger and OpenAPI](../api-spec/swagger_and_openapi.md) |
| UI | Product list from the database, per-product chat through the platform, retry on 502 and 503, command palette, theme toggle | `client/components/*` |
| CI | Lint, typecheck, unit and contract tests, build | `.github/workflows/ci.yml` |

What is a stub or fake today:

| Area | Reality | Item |
| :--- | :--- | :--- |
| Dashboard stats | "342 ms", "All Systems Nominal", the token budget and the status pills are literals | UI-7 |
| Orchestrator toggle | A Redux value nothing reads | UI-11 |

What does not exist:

| Missing | Item |
| :--- | :--- |
| Authentication and authorization; identity comes from the body | SEC-1, SEC-2, SEC-3 |
| Chat history, users and workspaces (tables exist, no code) | DOM-5, UI-9 |
| One chat with @mention | API-4 |
| `loading.tsx`, `error.tsx`, `not-found.tsx`; URL state | UI-4, UI-2 |
| Integration tests in CI | OPS-1 |
| Request id propagation, rate limiting, idempotency | API-5, API-3 |

## Phase 1: hardening

Goal: nothing in the platform lies, and nobody can act as someone else. Each item is a feature spec ([template](future_features_template.md)), built test-first (R-01), and done when its exit evidence exists and `npm run lint && npm run typecheck && npm run test && npm run build` pass (plus `npm run test:integration` for database code).

| # | Item | Debt | Exit evidence |
| :--- | :--- | :--- | :--- |
| H1 | Authentication and server-side identity. Pick the mechanism in an ADR. Remove `user_id` and `workspace_id` from public request bodies (a breaking change: update OpenAPI and the [chat doc](../api-spec/agents_and_chat_endpoints.md)). | SEC-1, SEC-2, SEC-3 | A route test per endpoint shows 401 without credentials. The `sineva-ai` contract test still passes with a server-derived `user_id`. `POST /api/v1/agents` is restricted. |
| H2 | Secrets without defaults. Validate required environment variables at startup. | SEC-4, INF-6 | The app fails to start in production with a missing secret (test). `grep` for default credentials in `env.ts` and compose finds none (R-28). |
| H3 | Honest errors. Invalid JSON returns a client error. 500 returns a fixed message. The gateway stops logging response bodies (done, see logging_and_pii_masking.md). | API-1, SEC-5, SEC-6 | Tests: bad JSON gives 422, a thrown `Error` does not reach the response text, the gateway log has no body. |
| H4 | Truthful infrastructure. Real health probes. Presign failures surface as errors, with a public signing endpoint. The cache is real or gone. | INF-1, INF-2, INF-3, INF-4, INF-5, SEC-7 | Fake-based tests: a failing dependency shows `standby` and a non-200 health status. A signing failure is not a 201. An integration test for the Redis adapter, or the adapter and its health entry are removed. |
| H5 | Remove invented numbers and statuses from the UI. Fix strings that break the wording rules in files you touch. | UI-7, COPY-1, COPY-2 | The page shows no number without a source. The wording checklist in [product model and wording](../product/product_model_and_wording.md) passes for touched strings. |
| H6 | Page states and basics. `loading.tsx`, `error.tsx`, `not-found.tsx`. Selection in the URL. `dark:` follows the theme. Accessibility fixes. Markdown replies. | UI-4, UI-2, UI-3, UI-5, UI-6, UI-8 | The three files exist (R-31). Both themes checked by keyboard. A renderer test for script and link injection. |
| H7 | Guards. Integration tests in CI. The OpenAPI route guard test. A safe `docker:down`. A decision on idempotency for chat. | OPS-1, API-2, OPS-2, API-3 | CI runs `test:integration` against a Postgres service. The guard test fails when a route has no spec entry. `docker:down` no longer passes `-v`. |

Order: H1 and H2 first. H3 next, because it is small and removes an information leak. H4 and H5 before any new feature, because operators and users read these values. H6 and H7 can run in parallel once H1 is done.

## Phase 2: one chat

Goal: the product the Founder described. One conversation with Sino, a product called by @mention ([ADR-0010](../decisions/0010-one-chat-with-mentions.md)).

| # | Item | Debt | Exit evidence |
| :--- | :--- | :--- | :--- |
| P1 | Design and ADR: how one chat maps to `session_id`, `chat_sessions.agent_slug` and `chat_messages.agent_slug`; how Sino (the orchestrator) is called; how the answering product is shown; where history lives; the workspace on the request (`tenant_id`). | API-4, DOM-5, UI-9 | An accepted ADR in this repository and the matching one in `sineva-ai`. |
| P2 | Contract change, `sineva-ai` first: new fixtures there, copied here byte for byte (R-40), gateway and Zod schema, `ChatReplyView`, OpenAPI, [chat doc](../api-spec/agents_and_chat_endpoints.md). | API-4 | Contract tests pass in both repositories. |
| P3 | One-chat UI: parse the @mention, default to Sino, show the answering product, render Markdown, split the dashboard, remove the console panels. | UI-1, COPY-1 | Component tests for mention parsing (no comma form, plain `@Sino`). The wording checklist passes. |
| P4 | One owner for the product registry, and a data migration that renames old slugs. | DOM-4, DOM-6 | An accepted ADR. A migration reviewed under R-18 to R-20 and R-42. |
| P5 | Guardrail review of every product tool. A tool that sends, publishes, pays, hires or rejects needs an approval step. | none | Review notes against R-34 for each tool in `sineva-ai`. |

## Phase 3: ideas, not committed

These came from the earlier roadmap. No design, owner or priority exists for them. Do not plan against them.

- Streaming replies from `sineva-ai` to the browser. It needs `sineva-ai` support and a change to the contract.
- A file upload UI on top of presign, after H1 and H4.
- Roles and an audit log, after H1.

## Open decisions

Each blocks an item above. They need a Founder or engineering decision, not more code.

1. Authentication mechanism (H1).
2. Session model for one chat, and where history lives (P1).
3. Which service owns the product registry (P4).
4. Whether chat needs an idempotency key (H7).
5. What the public 503 copy says about a turn that may have gone through ([copywriting and brand](../design-context/copywriting_and_brand.md)).

## Related

[Known issues and tech debt](known_issues_and_tech_debt.md), [feature development workflow](feature_development_workflow.md), [future features template](future_features_template.md), [agent rules](../governance/agent_rules.md).
