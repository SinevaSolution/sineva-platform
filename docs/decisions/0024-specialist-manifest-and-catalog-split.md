---
title: "Specialist Manifest and Catalog Split"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-22"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "specialists", "manifest", "catalog", "agent-configs", "accent-key", "i18n"]
summary: "The platform presents sineva-ai's specialist catalog through a static manifest in code. The manifest owns display copy, sineva-ai owns availability, and the agent_configs table is dropped."
related_docs:
  - "README.md"
  - "0010-one-chat-with-mentions.md"
  - "0012-canonical-product-slugs-and-guardrails.md"
  - "0015-sineva-ai-owns-internal-chat-contract.md"
  - "0016-upstream-failures-return-502-503.md"
  - "0018-workspace-tenancy-and-public-contract.md"
  - "0023-locale-preference-and-i18n-architecture.md"
  - "../api-spec/agents_and_chat_endpoints.md"
  - "../../docs/implementation-plan/M0-foundations.md"
adr_id: "0024"
decision_status: "accepted"
supersedes: []
---

# 0024 Specialist manifest and catalog split

## Status

Accepted (2026-10-22). Founder delegated: the implementation plan recommends this option in WP-M0-31 (FR-SPEC-05, FR-SPEC-06, FR-SPEC-08), and the Founder delegated its acceptance to the work package that builds it. This is the platform half. The sineva-ai half (WP-M0-19: `GET /api/v2/agents`, `catalog_version`, the `catalog_slugs.json` fixture) does not exist yet, so the wire shape in decision 4 is an assumption that the contract fixture will confirm or correct.

## Context

The platform kept its own roster in a table, `agent_configs`, filled by `prisma/seed.ts` and extended by `POST /api/v1/agents`. It carried invented runtime numbers (`avg_latency_ms`, `active_sessions_count`, `daily_tokens_used`), an `accent_token` that is a CSS variable name nothing reads, English-only copy, and stale `sino-*` rows after a re-seed. sineva-ai also owns a catalog (three registries today, one after WP-M0-19), so two places claimed to know which specialists exist (DOM-3, DOM-4, DOM-6, COPY-2).

The shell (sidebar, @mention menu, Home, new chat) reads its specialists through `loadWorkspaceContext`. That read must not fail because sineva-ai is down: a customer who cannot reach Sino can still open the app, read their chats and see who is on the team.

## Decision

1. **The manifest is code** (`src/shared/specialists/manifest.ts`), not a table. One entry per wave 1 specialist (`sinopeople`, `sinofinance`, `sinosales`, `sinosocial`, `sinohelp`, `sinoinsights`), in display order. Each entry has `agent_slug`, `handle` (the display form, "SinoFinance", never "Sino Finance"), `accent_key`, `room_theme_id`, `order` and localized copy for `en` and `id`: `role_title`, `short_description` and three `starter_prompts`. It lives in `src/shared` because it is pure data that both server and client read.
2. **`accent_key` is a fixed 13-value enum** (`people`, `finance`, `sales`, `social`, `help`, `insights`, then `desk`, `write`, `shop`, `guard`, `tax`, `legal`, `ops`). No data can inject a color (FR-UX-16). Only the six wave 1 keys have entries today; the other seven are reserved so wave 2 and 3 do not change the type. The accent ramps stay in CSS (`data-product-accent`).
3. **The split.** The manifest owns display copy. sineva-ai owns availability: whether a specialist exists, its wave, its category and whether it is `live`. Consequences:
   - The shell reads the manifest only. It never calls sineva-ai to render a name, a role or a starter prompt, so it keeps working when sineva-ai is down.
   - `GET /api/v1/workspaces/{workspace_id}/agents` calls sineva-ai `GET /api/v2/agents` on every request. If sineva-ai is unreachable the route answers 503, if it answers badly 502 (ADR-0016). It never serves a stale or invented roster and never falls back to the manifest as if the manifest were availability (FR-SPEC-08).
   - The shell showing a specialist the catalog would not list is acceptable in M0, because chat itself still goes through sineva-ai and fails with a typed error there. Availability gating of the shell arrives with `workspace_specialists` in M1.
4. **Catalog wire shape (assumed, to be confirmed by the sineva-ai fixture).** After an optional `{ success, data }` envelope, the body is `{ catalog_version, agents: [ ... ] }`. Each agent has at least `agent_slug`, `handle`, `display_name`, `category`, `wave` and `status` (`live` or `coming_soon`). Extra fields (`skills`, `tool_allowlist`, `guardrail`, `tier`, `required_capabilities`) are tolerated and not read. The Zod schema in `ai_engine_v2_schemas.ts` is the one place to change. `category` is validated against the enum extended per the Roster PRD section 5 (`personal_ops`, `content_studio`, `marketplace_ops`, `it_security`, `tax_compliance`, `legal_drafting`, `inventory_procurement` added to the six existing values), so an unknown category is a 502, not a silent pass.
5. **Merge rules.** The manifest drives which specialists are presented and in which order. A catalog entry with no manifest entry (`sino`, wave 2 and 3 `coming_soon`) is ignored in M0. A manifest entry the catalog does not list is a catalog drift error (502): the platform will not show a specialist sineva-ai does not know. The merged roster (without per-user fields) is memoized in process by `catalog_version`; the upstream call itself is not cached, which is what keeps "down" honest.
6. **`enabled` is derived in M0.** `workspace_specialists` arrives in M1, so `enabled` is true for a wave 1 specialist whose catalog status is `live`. The OpenAPI schema says so in the field description.
7. **`my_access`** is `available` or `unavailable`, computed from the member's role (`specialist.use`) and `specialist_scope` with `allowed_specialists`. A blocked specialist keeps the same keys as one that is not enabled, so the response does not reveal why (FR-SPEC-13).
8. **Localized copy ships to the browser as data.** The shell picks the locale server-side (`getLocale`, ADR-0023) and passes one language's copy as props. The API returns both languages under `copy.en` and `copy.id` so it needs no locale negotiation and stays cacheable. Manifest strings pass the same copy lint as the message catalogs (`lintCopyString`), enforced by a test, because they never pass through `messages/*.json`. Indonesian role titles are Indonesian ("Spesialis Keuangan & Arus Kas"), which fixes "Aku {role} kamu" reading as English. The team chat's own starters (Sino, not a specialist) stay in the message catalog under `room.starters.sino`.
9. **`agent_configs` is dropped.** Migration `20261022120000_drop_agent_configs` drops the table (its foreign key to `workspaces` goes with it). The data is seed-only: `prisma/seed.ts` upserted the six default rows, and the only other writer was `POST /api/v1/agents`, which no UI called. A deployment that registered extra rows through that route loses them. Check before deploying: `SELECT agent_slug FROM platform.agent_configs WHERE agent_slug NOT IN ('sinopeople','sinofinance','sinosales','sinosocial','sinohelp','sinoinsights');` The DOM-6 stale `sino-*` rows disappear with the table.
10. **`POST /api/v1/agents` and `GET /api/v1/agents` are removed.** Custom specialists are out of scope, so no endpoint creates one, and the list moved under the workspace (D-M0-1). The route files, the `AgentRepository` port, its Prisma adapter, the seed block and the old OpenAPI paths go in the same change.

## Consequences

- One place per concern: sineva-ai says who exists and what is live; the manifest says how they look and read; the database holds neither.
- The shell is independent of sineva-ai for presentation. The roster route is not, by design.
- Adding a wave 2 specialist is one manifest entry plus the accent ramp (M4), and the equality test (manifest slugs against `catalog_slugs.json`) keeps the two lists honest once the fixture exists.
- Until the sineva-ai fixture lands, the equality test runs against the platform's canonical slug list (`domain/chat/specialist_catalog.ts`) and the fixture check skips itself. That duplicate list is debt: it should read from the manifest once the fixture exists.
- Member scoping is applied by the roster route. The shell still lists all six for every member, as before; narrowing it needs the member's `specialist_scope` in `loadWorkspaceContext` and belongs with `workspace_specialists` (M1).
- Native-speaker review of the Indonesian manifest copy is part of the pre-beta gate (ADR-0023).

## Alternatives considered

1. **Keep a table for presentation.** It would let non-engineers edit copy, but it is the pattern that produced DOM-3, DOM-4 and DOM-6 (rows drifting from the catalog), and it makes the equality test impossible without a database.
2. **Serve display copy from sineva-ai.** One source, but the shell would need sineva-ai for every page, and sineva-ai has no business knowing Indonesian UI wording (the platform owns i18n, ADR-0023).
3. **Serve the last good catalog when sineva-ai is down.** Friendlier, but it is a silent stale roster, which FR-SPEC-08 and ADR-0008 forbid. A short-TTL cache has the same flaw for the length of the TTL.
4. **Fall back to the manifest for availability on a failed catalog call.** The manifest would then pose as a roster; the 503 is the honest answer and the UI shows its error state.
