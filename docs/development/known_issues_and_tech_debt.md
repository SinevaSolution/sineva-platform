---
title: "Known Issues and Tech Debt"
category: "development"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "tech-debt", "known-issues", "security", "risk"]
summary: "Every known deviation from the rules in sineva-platform, grouped by area with security first: symptom, root cause, location, severity, what not to copy, and a suggested fix."
related_docs:
  - "roadmap.md"
  - "feature_development_workflow.md"
  - "../governance/agent_rules.md"
  - "../api-spec/overview.md"
  - "../engineering/error_handling_and_failure_modes.md"
  - "../product/product_model_and_wording.md"
---

# Known issues and tech debt

These are the places where the code breaks a rule in [agent rules](../governance/agent_rules.md) or hides a risk. They are recorded so nobody copies them. Each item names where the problem lives, whether it is the symptom or the root cause, and a suggested fix. A suggested fix is a proposal, not a decision. Anything that changes a contract or a data model needs an ADR first.

Verified by reading the code on 2026-10-21, except where an item says otherwise. Sequencing of the fixes is in the [roadmap](roadmap.md).

"Current" is what the code does. "Target" is decided but not built.

## How to read an item

| Field | Meaning |
| :--- | :--- |
| Symptom | What a user, operator or reader sees |
| Root cause | Where the problem really lives, as opposed to where it shows up |
| Location | Files and symbols |
| Severity | High: a security exposure, possible data loss, or a wrong result reported as right, reachable today. Medium: misleading behavior or a risk that grows with use. Low: cosmetic, tooling or tidiness. |
| Do not copy | The pattern new code must avoid |
| Suggested fix | The smallest change that removes the cause |

When you fix an item, delete it here in the same change (R-38) and remove its line from the "Known debt" list in agent rules.

## Index

| ID | Item | Severity |
| :--- | :--- | :--- |
| SEC-1 | No authentication or authorization | High |
| SEC-2 | `user_id` taken from the request body | High |
| SEC-3 | Presign takes `workspace_id` from the body | High |
| SEC-4 | Hardcoded default secrets | High |
| SEC-7 | Health route is public and shows internal details | Low |
| INF-1 | In-memory "Redis" cache, `ping()` always true | Medium |
| INF-2 | Presign returns an unsigned URL on error | Medium |
| INF-3 | Health reports healthy without checking | High |
| INF-4 | Hardcoded `engine_version` | Low |
| INF-5 | Presigned URL host is the internal Docker name | Medium |
| INF-6 | `AI_ENGINE_TIMEOUT_MS` is not validated | Low |
| API-3 | A chat retry can run the turn twice | Medium |
| API-4 | The orchestrator `sino` is unreachable; chat is per product | Medium |
| API-6 | `swagger-ui-react` unused, "Swagger UI" labels wrong | Low |
| API-7 | R-23's check names a test that does not exist | Low |
| DOM-1 | Domain errors carry HTTP status and import `@sineva/shared` | Low |
| DOM-2 | Cache invalidation clears one key | Low |
| DOM-3 | New-agent defaults live in the repository | Low |
| DOM-4 | Two companion registries | Medium |
| DOM-5 | Unused tables and columns | Low |
| DOM-6 | Databases seeded with old slugs keep stale rows | Medium |
| COPY-1 | UI copy breaks the wording rules | Medium |
| COPY-2 | Seed data holds invented metrics and unsourced claims | Medium |
| UI-1 | One 777-line dashboard component | Medium |
| UI-2 | Selection is not in the URL | Low |
| UI-3 | Server data is copied into Redux in an effect | Low |
| UI-4 | No loading, error or not-found pages | Medium |
| UI-5 | The `dark:` variant is not tied to `data-theme` | Medium |
| UI-6 | `reply_content` Markdown is shown as plain text | Medium |
| UI-7 | Fake dashboard stats | High |
| UI-8 | Accessibility deviations | Medium |
| UI-9 | Transcripts are lost on reload | Medium |
| UI-10 | Unused front-end packages and tokens | Low |
| UI-11 | The orchestrator mode toggle does nothing verified | Low |
| OPS-3 | Prettier width disagrees with the code | Low |
| AI-1 | sineva-ai: session ownership is not checked | High |
| AI-2 | sineva-ai: Postgres persistence is dormant | Medium |
| AI-3 | sineva-ai: Docker build is broken | Medium |

## Security and trust

### SEC-1 No authentication or authorization

| | |
| :--- | :--- |
| Symptom | Any caller that reaches port 3000 can register an agent, chat as any user and presign an upload. |
| Root cause | There is no auth layer. No `middleware.ts` or `proxy.ts` exists under `apps/web/src`, and no handler checks a caller. |
| Location | `apps/web/src/app/api/**` |
| Severity | High |
| Do not copy | A new route that assumes the caller is trusted, or that reads identity from the body (R-27). |
| Suggested fix | Add authentication at the edge and derive the user and workspace on the server. Choose the mechanism in an ADR. Then authorize each route, starting with `POST /api/v1/agents`. |

### SEC-2 `user_id` taken from the request body

| | |
| :--- | :--- |
| Symptom | The chat `user_id` is whatever the client sends. The dashboard always sends `usr_executive_01`. `sineva-ai` receives that value as the user. |
| Root cause | `sendAgentChatDtoSchema` takes `user_id` from the public request, and the route passes it through (symptom of SEC-1). |
| Location | `server/application/dtos/chat_dto.ts`, `app/api/v1/agents/[agent_slug]/chat/route.ts`, `sendToCompanion` in `client/components/sineva_dashboard.tsx` |
| Severity | High |
| Do not copy | Any access decision based on a body field. |
| Suggested fix | Remove `user_id` from the public request once SEC-1 exists, and set it from the session in the use case. This is a breaking contract change: write the ADR and update the OpenAPI document and the [chat doc](../api-spec/agents_and_chat_endpoints.md). |

### SEC-3 Presign takes `workspace_id` from the body

| | |
| :--- | :--- |
| Symptom | A caller can presign an upload into `workspaces/<any id>/...`. The id is not checked against a workspace, and it is not sanitized in the key (only the file name is). |
| Root cause | `workspace_id` is a request field, and the `workspaces` table has no code behind it. |
| Location | `presignStorageDtoSchema` in `chat_dto.ts`, `SeaweedStorageRepository.createPresignedUploadUrl` |
| Severity | High |
| Do not copy | Building a storage key from client input without validation. |
| Suggested fix | Take the workspace from the authenticated context, check membership, and validate the id as a UUID before it goes into a key. |

### SEC-4 Hardcoded default secrets

| | |
| :--- | :--- |
| Symptom | A deployment that forgets an environment variable runs with known credentials and no warning. |
| Root cause | `getEnvConfig()` uses `??` defaults for the database URL (password `sineva_secret_password`), the S3 key pair and `AI_ENGINE_INTERNAL_API_KEY` (`sineva_internal_service_token_dev`). `docker-compose.yml` repeats them as `${VAR:-default}` and literals. |
| Location | `server/infrastructure/config/env.ts`, `docker-compose.yml` |
| Severity | High |
| Do not copy | A fallback value for a secret (R-28). |
| Suggested fix | Validate required variables at startup in production and fail fast. Keep dev defaults in `.env.example` only. In compose, require secrets with the `${VAR:?message}` form. |

### SEC-7 Health route is public and shows internal details

| | |
| :--- | :--- |
| Symptom | `GET /api/v1/health` shows the `sineva-ai` internal URL, the S3 bucket name and uptime to anyone. |
| Root cause | The route has no auth and returns every field the use case builds. |
| Location | `get_system_health_use_case.ts`, `app/api/v1/health/route.ts` |
| Severity | Low |
| Do not copy | Returning internal addresses from a public route. |
| Suggested fix | Keep a minimal public probe (status only). Return detail to authenticated callers. |

The cross-tenant session issue in `sineva-ai` (AI-1) is also a security item; it lives in the other repository.

## Infrastructure stubs and health

### INF-1 In-memory "Redis" cache, `ping()` always true

| | |
| :--- | :--- |
| Symptom | The cache is per process and is lost on restart. Two instances disagree. The health route reports Redis healthy whatever Redis does. |
| Root cause | `RedisCacheRepository` keeps a `Map` and never opens a connection. `redis_client.ts` (ioredis) exists and nothing calls it. |
| Location | `server/infrastructure/cache/redis_cache_repository.ts`, `redis_client.ts` |
| Severity | Medium |
| Do not copy | A class named for a technology that it does not use. It breaks R-26. |
| Suggested fix | Implement the adapter with ioredis, with a real `PING`, and test it against a throwaway Redis. Or remove the cache, and the health entry, until it is needed. |

### INF-2 Presign returns an unsigned URL on error

| | |
| :--- | :--- |
| Symptom | The route answers 201 with a URL that will be rejected by S3. Nothing in the response says it is unsigned. |
| Root cause | `createPresignedUploadUrl` catches every error and builds `<endpoint>/<bucket>/<key>?X-Amz-Expires=900`. |
| Location | `server/infrastructure/storage/seaweed_storage_repository.ts` |
| Severity | Medium |
| Do not copy | A `catch` that returns a plausible value (R-26, [ADR-0008](../decisions/0008-no-silent-fallbacks.md)). |
| Suggested fix | Remove the `catch`, or throw a typed domain error that maps to a 5xx. Test: a signing failure produces an error response. |

### INF-3 Health reports healthy without checking

| | |
| :--- | :--- |
| Symptom | Stopping Postgres, Redis or SeaweedFS does not change `/api/v1/health`. It always answers 200. |
| Root cause | Postgres is `healthy` when `DATABASE_URL` is set. Redis `ping()` returns `true`. S3 `checkHealth()` returns `Boolean(endpoint)`, which is always true. Only the `sineva-ai` probe is real. |
| Location | `get_system_health_use_case.ts`, `RedisCacheRepository.ping`, `SeaweedStorageRepository.checkHealth` |
| Severity | High |
| Do not copy | A health value computed from configuration. |
| Suggested fix | Add real probes with short timeouts: `SELECT 1`, Redis `PING`, S3 `HeadBucket`. Return a non-200 status when a required dependency is down. Add the failing tests first, with fakes. |

### INF-4 Hardcoded `engine_version`

| | |
| :--- | :--- |
| Symptom | `AiEngineHealthResult.engine_version` is always `1.0.0` or `1.0.0-standby`. The health route does not show it, so nothing is wrong on the wire today. |
| Root cause | The gateway writes a constant instead of reading the version from the `sineva-ai` health response. |
| Location | `InternalAiEngineGateway.checkHealth` |
| Severity | Low |
| Do not copy | Returning a fixed value for a measured field. |
| Suggested fix | Read the version from the health body, or drop the field. |

### INF-5 Presigned URL host is the internal Docker name

| | |
| :--- | :--- |
| Symptom | In the compose stack `upload_url` starts with `http://seaweedfs-s3:8333`, which a browser outside the Docker network cannot resolve. Not tested end to end. |
| Root cause | The URL is signed against `S3_ENDPOINT`, which compose sets to the internal host. There is no separate public endpoint setting. |
| Location | `docker-compose.yml`, `s3_client.ts`, `SeaweedStorageRepository` |
| Severity | Medium |
| Do not copy | Returning a URL built from an internal address. |
| Suggested fix | Add a public S3 endpoint setting for signing, and an end-to-end upload check. |

### INF-6 `AI_ENGINE_TIMEOUT_MS` is not validated

| | |
| :--- | :--- |
| Symptom | A non-numeric value makes every chat return 503 at once. |
| Root cause | `Number(process.env.AI_ENGINE_TIMEOUT_MS ?? '15000')` yields `NaN`, and the abort timer fires immediately. |
| Location | `getEnvConfig()` |
| Severity | Low |
| Do not copy | Casting an environment string with no check. |
| Suggested fix | Parse with Zod at startup and fail on an invalid value. |

## API contract and errors

### API-3 A chat retry can run the turn twice

| | |
| :--- | :--- |
| Symptom | A 503 can follow a turn that `sineva-ai` finished. The dashboard's Retry then sends the message again. The OpenAPI `503` description used to say "Safe to retry"; it now warns that a retry can run the turn twice. |
| Root cause | There is no idempotency key. The timeout aborts the client side only. |
| Location | `InternalAiEngineGateway.dispatchAgentChat`, `sendToCompanion` |
| Severity | Medium |
| Do not copy | Offering a retry on a non-idempotent call without a key. |
| Suggested fix | Add a client-supplied idempotency key to the public and internal contracts (both repos, ADR). Until then, keep the spec's `503` text as it is (it states the double-run risk) and consider a warning in the Retry toast ([copywriting and brand](../design-context/copywriting_and_brand.md)). |

### API-4 The orchestrator `sino` is unreachable; chat is per product

| | |
| :--- | :--- |
| Symptom | `POST /api/v1/agents/sino/chat` returns 404. The client keeps one transcript and one session per product. This does not match [ADR-0010](../decisions/0010-one-chat-with-mentions.md). |
| Root cause | The route requires the slug in `agent_configs`, and `sino` is not seeded. `sineva-ai` also has `POST /chat/orchestrate`, which the platform does not call. |
| Location | `SendAgentMessageUseCase`, `seed.ts`, `client/store/slices/agent_slice.ts` |
| Severity | Medium |
| Do not copy | Keying conversations by product. |
| Suggested fix | Design the one-chat mapping first (session model, orchestrator call, attribution). Write the ADR, then change the route, schema and UI. |

### API-6 `swagger-ui-react` unused, "Swagger UI" labels wrong

| | |
| :--- | :--- |
| Symptom | `/api-docs` is a static view, but the palette item and a dashboard link say "Swagger UI". The dependency is installed and unused. |
| Root cause | The viewer was never built, or was replaced, and the text stayed. |
| Location | `apps/web/package.json`, `client/components/command_palette.tsx`, `client/components/sineva_dashboard.tsx` |
| Severity | Low |
| Do not copy | A label for a feature that does not exist. |
| Suggested fix | Fix the labels now. Then either use the package on `/api-docs` or remove it. |

### API-7 R-23's check names a test that does not exist

| | |
| :--- | :--- |
| Symptom | R-23 says route tests assert keys with `assertSnakeCaseKeys`. Only `packages/shared` tests use it, and no route test does. |
| Root cause | The rule describes the helper, not an existing check. |
| Location | `governance/agent_rules.md` (R-23), `packages/shared/src/snake_case.ts` |
| Severity | Low |
| Do not copy | Citing a check you have not run. |
| Suggested fix | Add a route test that walks the response keys (not only the top level), or reword R-23 to name the real check. |

## Domain and data model

### DOM-1 Domain errors carry HTTP status and import `@sineva/shared`

| | |
| :--- | :--- |
| Symptom | The domain layer knows about HTTP and the response package (R-12). |
| Root cause | `DomainError` has a `status` field and a type import of `ErrorDetail` from `@sineva/shared`. |
| Location | `server/domain/errors/domain_error.ts` |
| Severity | Low |
| Do not copy | Putting a transport concern in the domain. |
| Suggested fix | Give errors a `code` only, and map code to status in `server/http`. Keep `ErrorDetail` out of the domain. |

### DOM-2 Cache invalidation clears one key

| | |
| :--- | :--- |
| Symptom | After `POST /api/v1/agents`, only the default list is refreshed. Other pages, filters and the home page (`per_page: 20`) show stale data for up to 30 seconds. |
| Root cause | `registerAgent` deletes the literal key `agents:list:p_1:pp_10:cat_all`. |
| Location | `server/application/use-cases/get_agents_use_case.ts` |
| Severity | Low |
| Do not copy | Invalidating a hand-written key. |
| Suggested fix | Version or tag the list keys and clear by prefix, or drop the cache until it is real (INF-1). |

### DOM-3 New-agent defaults live in the repository

| | |
| :--- | :--- |
| Symptom | A new agent starts with `status: online`, `avg_latency_ms: 350`, `active_sessions_count: 1` and `accent_token: --teal-500`. These are not measurements. |
| Root cause | The defaults are written in `PrismaAgentRepository.create`, not in the domain. |
| Location | `server/infrastructure/database/prisma_agent_repository.ts` |
| Severity | Low |
| Do not copy | Business defaults in an adapter. |
| Suggested fix | A domain factory that builds a new agent, with honest zero values for runtime counters. |

### DOM-4 Two companion registries

| | |
| :--- | :--- |
| Symptom | The platform registry and `sineva-ai` disagree on names (`SinoFinance` and `Sino Finance`). An agent registered in the platform has no engine behind it, so chat returns 502. |
| Root cause | Two sources of truth: platform `agent_configs`, and `sineva-ai`'s static catalog (`build_canonical_agent_entities`) plus its `ai_agents` table. |
| Location | `apps/web/prisma/schema.prisma` (`AgentConfig`), `sineva-ai/src/sineva_ai/agentic/agents/specialists.py` |
| Severity | Medium |
| Do not copy | A second copy of data another service owns. |
| Suggested fix | Decide one owner for slug, name and category (ADR). The platform may keep only presentation fields keyed by slug. Until then, document that `POST /api/v1/agents` does not create an engine agent. |

### DOM-5 Unused tables and columns

| | |
| :--- | :--- |
| Symptom | Only `agent_configs` has code. `workspaces`, `users`, `chat_sessions`, `chat_messages` and `storage_objects` are empty tables. `chat_messages.reasoning_summary`, `suggested_actions` and `tokens_used` match no field in any reply. |
| Root cause | The schema was drawn before the features and before the `sineva-ai` contract ([ADR-0015](../decisions/0015-sineva-ai-owns-internal-chat-contract.md)). |
| Location | `apps/web/prisma/schema.prisma` |
| Severity | Low |
| Do not copy | Adding columns no code fills. |
| Suggested fix | Decide chat persistence together with the one-chat design (API-4), then drop or reshape the tables in a migration. |

### DOM-6 Databases seeded with old slugs keep stale rows

| | |
| :--- | :--- |
| Symptom | A database seeded earlier with `sino-*` slugs shows both old and canonical rows after a re-seed. |
| Root cause | `seed.ts` upserts by `agent_slug`, so it adds the canonical rows and never renames or removes the old ones. |
| Location | `apps/web/prisma/seed.ts` |
| Severity | Medium |
| Do not copy | Relying on a seed to migrate data. |
| Suggested fix | A one-off data migration (or a manual SQL step in the release notes) that renames the old slugs. Follow the migration rules (R-18 to R-20, R-42). |

## Product copy and data

### COPY-1 UI copy breaks the wording rules

| | |
| :--- | :--- |
| Symptom | "6 Specialized Agents", "Autonomous Multi-Agent Handoff", per-product "companions", internal terms ("BFF", "Docker bridge"), "Swagger UI" for a static page. |
| Root cause | The UI was written as a developer console before the wording decisions. |
| Location | `client/components/sineva_dashboard.tsx`, `client/components/command_palette.tsx`, `app/layout.tsx` |
| Severity | Medium |
| Do not copy | Any string on the full list in [product model and wording](../product/product_model_and_wording.md). |
| Suggested fix | Fix strings when a file is touched, or all at once with the one-chat UI. |

### COPY-2 Seed data holds invented metrics and unsourced claims

| | |
| :--- | :--- |
| Symptom | Cards show session counts, token counts and latency that were never measured. Descriptions carry "99.4% SLA adherence", "high-converting", and platform names. |
| Root cause | `seed.ts` was written as demo data and is displayed as real. |
| Location | `apps/web/prisma/seed.ts` |
| Severity | Medium |
| Do not copy | A number with no source. |
| Suggested fix | Seed zero runtime counters, or show none. Rewrite descriptions with the Founder against the guardrails. |

## Dashboard and UI

### UI-1 One 777-line dashboard component

| | |
| :--- | :--- |
| Symptom | Header, hero, stats, roster, chat and inspector are in one client component. Changes touch everything. |
| Root cause | Everything was built in one file. |
| Location | `client/components/sineva_dashboard.tsx` |
| Severity | Medium |
| Do not copy | A component that fetches, formats and lays out the whole page. |
| Suggested fix | Split by concern when the one-chat UI is built: chat, roster, header. Move the fetch logic into a thunk or a hook. |

### UI-2 Selection is not in the URL

| | |
| :--- | :--- |
| Symptom | A reload resets the selected product and filter. A view cannot be linked. |
| Root cause | `selected_agent_slug` and `active_category_filter` live in Redux only. |
| Location | `client/store/slices/agent_slice.ts` |
| Severity | Low |
| Do not copy | Navigation state in a store. |
| Suggested fix | Put it in the URL (search params or a route segment). |

### UI-3 Server data is copied into Redux in an effect

| | |
| :--- | :--- |
| Symptom | The first render uses the prop, then an effect copies it into the store. Two sources of the same list. |
| Root cause | `useEffect` calls `setAgentsCatalog(initialAgents)`. |
| Location | `client/components/sineva_dashboard.tsx` |
| Severity | Low |
| Do not copy | Mirroring server props into a client store. |
| Suggested fix | Read the list from props, or hydrate the store at creation. |

### UI-4 No loading, error or not-found pages

| | |
| :--- | :--- |
| Symptom | If the home page's database read fails, Next.js shows its default error. A bad URL shows the default 404. |
| Root cause | No `loading.tsx`, `error.tsx` or `not-found.tsx` under `src/app` (R-31). |
| Location | `apps/web/src/app` |
| Severity | Medium |
| Do not copy | A route with only a happy path. |
| Suggested fix | Add the three files with copy from [copywriting and brand](../design-context/copywriting_and_brand.md). |

### UI-5 The `dark:` variant is not tied to `data-theme`

| | |
| :--- | :--- |
| Symptom | `dark:` classes follow the OS setting, not the app theme. They misfire in both directions. |
| Root cause | Tailwind v4's default `dark:` variant, and no `@custom-variant` in `globals.css`. |
| Location | `packages/ui/src/index.tsx` (`Badge`), `client/components/sineva_dashboard.tsx`, `app/globals.css` |
| Severity | Medium |
| Do not copy | A `dark:` class. Use semantic tokens. |
| Suggested fix | See [design tokens](../design-context/design_tokens.md). Verify both themes visually. |

### UI-6 `reply_content` Markdown is shown as plain text

| | |
| :--- | :--- |
| Symptom | Replies show `**bold**` and backticks literally. |
| Root cause | The transcript renders `message_text` in a `<p>` with `whitespace-pre-wrap`. |
| Location | `client/components/sineva_dashboard.tsx` |
| Severity | Medium |
| Do not copy | Rendering model output with `dangerouslySetInnerHTML`. |
| Suggested fix | A sanitizing Markdown renderer, with tests for script and link injection. |

### UI-7 Fake dashboard stats

| | |
| :--- | :--- |
| Symptom | "342 ms" median latency, "All Systems Nominal", "100% Internal AI Mesh", hardcoded `online` status pills, and a token budget of `1,391,250 / 5,000,000`. |
| Root cause | Literals in the component and in the initial Redux state. Nothing reads real data. |
| Location | `client/components/sineva_dashboard.tsx`, `client/store/slices/workspace_slice.ts` |
| Severity | High |
| Do not copy | A statistic with no source. A green status with no check. |
| Suggested fix | Remove them, or bind them to real data (health with real probes, measured latency, a real workspace quota). |

### UI-8 Accessibility deviations

| | |
| :--- | :--- |
| Symptom | Controls under 44 px, `role="tab"` with no panel or arrow keys, a focus cue that is only a border color, no announcement of new replies, an input border under 3:1. |
| Root cause | The UI was not checked against R-32. |
| Location | `packages/ui/src/index.tsx` (`Button` `sm`), `client/components/sineva_dashboard.tsx`, `command_palette.tsx` |
| Severity | Medium |
| Do not copy | A role the component does not implement. |
| Suggested fix | The list and measured values are in [design system](../design-context/design_system.md). Fix with the UI rebuild and re-check by keyboard in both themes. |

### UI-9 Transcripts are lost on reload

| | |
| :--- | :--- |
| Symptom | A reload clears the conversation, and the `session_id` with it. The user cannot continue the `sineva-ai` session. |
| Root cause | Transcripts and session ids live in Redux only, and the platform stores no chat messages. |
| Location | `client/store/slices/agent_slice.ts`, unused `chat_sessions` and `chat_messages` tables |
| Severity | Medium |
| Do not copy | Treating the client store as the record of a conversation. |
| Suggested fix | Decide where history lives (platform or `sineva-ai`) in the one-chat design, then load it by session. |

### UI-10 Unused front-end packages and tokens

| | |
| :--- | :--- |
| Symptom | `gsap`, `motion`, `recharts`, `vaul`, `react-hook-form`, `@hookform/resolvers`, `swagger-ui-react`, six Radix packages and `ioredis` are installed and unused. `--ease-out-expo`, `--color-accent-highlight` and the `accent_token` field are unused. |
| Root cause | Packages and tokens were added ahead of use. |
| Location | `apps/web/package.json`, `app/globals.css` |
| Severity | Low |
| Do not copy | Installing a package before a change uses it. |
| Suggested fix | Remove or adopt each one. The inventory is in [UX and frontend libraries](../design-context/ux_and_frontend_libraries.md). |

### UI-11 The orchestrator mode toggle does nothing verified

| | |
| :--- | :--- |
| Symptom | "Human-in-the-Loop" and "Autonomous Handoff" change a Redux value that is sent in `context_metadata`. No platform code reads it. |
| Root cause | A control without a backend behavior. |
| Location | `client/store/slices/workspace_slice.ts`, `sendToCompanion` |
| Severity | Low |
| Do not copy | A control that does nothing (and implies an approval mode that does not exist, against the guardrails). |
| Suggested fix | Remove it, or implement an approval step for real and write the ADR. |

## Tooling and operations

### OPS-3 Prettier width disagrees with the code

| | |
| :--- | :--- |
| Symptom | `.prettierrc.json` sets `printWidth` to 100. Much of the code is wrapped near 80 columns, so `npm run format:check` would likely want to rewrite files. Not run for this document. |
| Root cause | The config and the code style were set separately. |
| Location | `.prettierrc.json` |
| Severity | Low |
| Do not copy | Running `format` across the repo in a feature PR (R-05). |
| Suggested fix | Pick one width, apply it in a single formatting commit, and keep it out of feature changes. |

## sineva-ai side (reference only)

These live in the `sineva-ai` repository. They are listed because they affect the platform. AI-2 and AI-3 were confirmed in the `sineva-ai` source on 2026-10-21 (`presentation/api/v1/dependencies.py` builds `InMemoryConversationRepository`; the `Dockerfile` copies `pyproject.toml` and `src` but not the `README.md` that `pyproject.toml` names). AI-1 comes from the `sineva-ai` review and was not re-verified here.

### AI-1 Session ownership is not checked

| | |
| :--- | :--- |
| Symptom | A caller who knows another user's `session_id` can continue that conversation. |
| Root cause | `sineva-ai` does not check that a `session_id` belongs to the caller or tenant. |
| Location | `sineva-ai` conversation use case |
| Severity | High |
| Do not copy | Treating a session id as a credential. |
| Suggested fix | Check ownership in `sineva-ai`. The platform needs `tenant_id` and a real `user_id` (SEC-2) to make that check possible. |

### AI-2 Postgres persistence is dormant

| | |
| :--- | :--- |
| Symptom | Conversation state in `sineva-ai` does not survive a restart. |
| Root cause | The in-memory repository is wired, not the Postgres one. |
| Location | `sineva-ai/src/sineva_ai/presentation/api/v1/dependencies.py` |
| Severity | Medium |
| Do not copy | Not applicable (other repository). |
| Suggested fix | Wire the Postgres repository. It affects the one-chat history design (UI-9). |

### AI-3 Docker build is broken

| | |
| :--- | :--- |
| Symptom | `npm run docker:up` cannot build the `sineva-ai` image. |
| Root cause | The Dockerfile does not copy the README that the Python build needs. |
| Location | `sineva-ai/Dockerfile` |
| Severity | Medium |
| Do not copy | Not applicable (other repository). |
| Suggested fix | Fix the Dockerfile in `sineva-ai`. |

## Related

[Roadmap](roadmap.md), [agent rules](../governance/agent_rules.md), [error handling and failure modes](../engineering/error_handling_and_failure_modes.md), [product model and wording](../product/product_model_and_wording.md), [API overview](../api-spec/overview.md).
