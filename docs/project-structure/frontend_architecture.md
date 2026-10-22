---
title: "Frontend Architecture"
category: "project-structure"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "frontend", "nextjs", "redux", "server-components", "client-boundary"]
summary: "How the frontend is built today (one client dashboard fed by a server page, state in Redux), the target shape, the rules for new UI work, and how the chat UI handles upstream failures."
related_docs:
  - "clean_architecture_layers.md"
  - "overview.md"
  - "../engineering/state_management_redux.md"
  - "../engineering/error_handling_and_failure_modes.md"
  - "../design-context/design_system.md"
  - "../design-context/design_tokens.md"
  - "../governance/agent_rules.md"
---

# Frontend Architecture

Rules: R-08, R-14, R-27, R-30 to R-33 in [agent rules](../governance/agent_rules.md). The backend side of the boundary is in [clean architecture layers](clean_architecture_layers.md).

Frontend code is `src/client` (components, store), the routing files in `src/app`, and the wire types in `src/shared`. "Current" is what the code does now. "Target" is decided and not built. New UI work follows Target even where the existing screen does not.

## 1. The boundary

- `src/client/**` never imports `@/server/**` or `server-only`. ESLint (`no-restricted-imports`) and `architecture.test.ts` both fail on it.
- Types the browser reads come from `src/shared` (`AgentView`, `ChatReplyView`). `server/http/*_contract.ts` guards them against the server types.
- Server components in `src/app` may call use cases from `@/server/container` directly. `app/page.tsx` does. Props passed to a client component must be serializable and typed with a `src/shared` view.
- Shared presentation primitives (`Button`, `Card`, `Badge`, `Container`, `StatusPill`) come from `@sineva/ui`.

## 2. Current

| Area | State today |
| :--- | :--- |
| Entry | `app/page.tsx` is an async server component with `dynamic = 'force-dynamic'`. It calls `getGetAgentsUseCase().execute({ page: 1, per_page: 20 })` and renders `<SinevaDashboard initialAgents={items} />`. |
| UI | One client component, `client/components/sineva_dashboard.tsx` (777 lines, `'use client'`). It holds the agent list, category filter, chat transcript, presign demo, API envelope viewer and status bar. `command_palette.tsx` and `theme_toggle.tsx` are the only other components. |
| Hydration | `useEffect` dispatches `setAgentsCatalog(initialAgents)` into Redux after mount. Until it runs, the component falls back to the `initialAgents` prop. |
| Selection | `selected_agent_slug` (default `sinofinance`) and `active_category_filter` live in Redux. Nothing is in the URL, so a reload loses the selected companion, the filter and every transcript, and a view cannot be linked. |
| Providers | `AppProviders` (`client/store/provider.tsx`) wraps the whole app in the Redux `Provider`, `next-themes` (`attribute="data-theme"`, `defaultTheme="light"`, `enableSystem={false}`) and the sonner `Toaster`. The store is created with `makeStore()` once per mount. |
| Route states | None. `src/app` has no `loading.tsx`, `error.tsx` or `not-found.tsx`. |
| Theming | Token variables switch on `[data-theme="dark"]` in `globals.css`. The Tailwind `dark:` variant is not tied to `data-theme` (no `@custom-variant`), and the dashboard uses `dark:` in a few places. |
| Identity | The chat call sends `user_id: 'usr_executive_01'` hardcoded. The workspace slice is seeded with constants (`wks_sineva_enterprise_01`, a token quota and a consumed count). |

### Debt in the current UI

- The dashboard is a single client component of about 750 lines. Split it as you touch it (Target below).
- Fake dashboard values: the "342 ms" median latency, the "All Systems Nominal" badge, and four infrastructure `StatusPill`s with hardcoded status. They do not read the health endpoint.
- Copy that breaks the wording rules (R-33): "Multi-Agent", "6 Specialized Agents", "You (Workspace Executive)". Fix with the owning change, not in passing.
- `reply_content` is rendered as plain text. See section 5.
- Server data is copied into Redux in an effect. See the rules below.

## 3. Target

| Area | Target |
| :--- | :--- |
| Rendering | Server components first. A route fetches through the container and renders markup on the server. |
| Client code | Small client islands: a component is `'use client'` only because it needs state, effects or a browser API (the chat composer, the command palette, the theme toggle). |
| Selection | The selected companion and the category filter live in the URL (path segment or search param, chosen per feature), so reload, back and share links work. |
| Route states | Every route segment has `loading.tsx`, `error.tsx` and, where an id can be missing, `not-found.tsx` (R-31). |
| Redux | Only for client-only UI state that several distant components share (command palette open, an in-progress transcript). Not a copy of server data. |
| Health and stats | Shown from the health endpoint or not at all. No invented numbers. |

## 4. Rules for new UI work

1. Start as a server component. Add `'use client'` to the smallest leaf that needs it.
2. Fetch on the server through `@/server/container`. Do not fetch on mount in an effect, and do not copy server props into Redux.
3. Put anything a user would expect a link to restore (selection, filter, page) in the URL.
4. Add `loading.tsx`, `error.tsx` and `not-found.tsx` with the route (R-31).
5. Use `src/shared` types for anything that crosses the wire. If the shape is new, add the view and its guard in `server/http` (R-14).
6. Use semantic tokens (`var(--color-surface)`), never raw hex (R-30). Check both themes. Meet the accessibility baseline (R-32).
7. Never hardcode identity in new code (R-27). A new route that needs it must flag the gap.
8. Copy follows the wording rules: companion, not assistant, chatbot or agent (R-33). Code identifiers keep "agent".
9. A failed call renders an error state. It never renders invented content.
10. Keep new components small and single-purpose. Do not grow `sineva_dashboard.tsx`.

## 4a. Language (i18n)

- Locale: profile `locale`, then the `sineva_locale` cookie, then `Accept-Language`, then `en`. No URL prefix. Resolved once per request in `src/i18n/server.ts` and handed to client components by `I18nProvider` in the root layout ([ADR-0023](../decisions/0023-locale-preference-and-i18n-architecture.md)).
- Code: `packages/i18n/` (registry, resolution, ICU-subset formatter, copy lint, key-usage check, pseudo-locale), `apps/web/src/i18n/` (provider, server helpers, catalog loader), `apps/web/messages/` (catalogs), `apps/web/eslint-rules/` (hardcoded-string rule).
- `packages/i18n` is consumed through the `@sineva/i18n` path alias (tsconfig and vitest), not a workspace link, so it needs no `npm install`.
- Specialist names, role titles and descriptions are data from the specialist registry and are not translated here yet.

## 5. Chat UI and upstream failures

`sendToCompanion` in `sineva_dashboard.tsx` posts to `/api/v1/agents/{slug}/chat`.

- Success (`response.ok && envelope.success && envelope.data`): stores `reply.session_id` per companion with `setChatSessionId`, appends `reply.reply_content` as an agent transcript item, and adds `token_usage.total_tokens` to the workspace counter only when sineva-ai reported it.
- Any other response: shows `toast.error` with the envelope's `message`. If the status is 502 or 503, the toast also has a Retry action that calls `sendToCompanion` again with the same text and session id. The retry does not append the user message a second time, because `handleSendPrompt` appended it once before the first call.
- Fetch or JSON-parse failure: `toast.error('Network error while contacting BFF endpoint')`, also with Retry.
- No fabricated text. The transcript only contains the user's own message and text sineva-ai produced. The raw envelope is kept for the envelope viewer only.

Gotchas:

- A non-JSON body from a proxy or a crashed server makes `response.json()` throw, so it shows the "Network error" toast even though the network worked.
- A 500 shows the server's `message`. `handleRouteError` puts the raw `Error.message` of an unknown error in the envelope (see [error handling](../engineering/error_handling_and_failure_modes.md)).
- Retry state lives in a closure inside one call. Closing the toast discards it.
- The first turn sends no `session_id`, so a retry of the first turn also sends none. If the first request reached sineva-ai before failing on the way back, the retry can create a second session.

### Chat thread streaming (WP-M0-30)

`ChatThread` (`src/client/components/chat/chat_thread.tsx`) shows replies as they stream. After a send it calls `openRunStream` (`src/client/lib/event_stream.ts`) with the run handle that `POST .../messages` returned. The state machine is `live_reply_model.ts` (pure, unit tested).

- Streamed text renders as plain text in the existing `RoomBubble`. It is never HTML. The room mood is `working` while streaming, `done` on done, `error` on error.
- A Stop button (with a Tooltip) calls `POST .../runs/{run_id}/cancel`; the partial text stays.
- An error shows a friendly message from the error code (`stream_errors.ts`) and a Try again button. If nothing was produced, Try again attaches to the same run; if the run ended, it sends the same words again as a new message.
- On opening a chat, if the last message is the person's, has a run handle, has no reply and is under 15 minutes old, the thread attaches to that run. That is how a new chat gets its reply (`StartChat` only creates the chat and navigates) and how a reload mid-reply resumes. Older unanswered messages are not started automatically.
- The log region does not announce tokens; completion is announced once through a status line.
- The English strings live in `stream_errors.ts` and the component until the message catalogs land (WP-M0-42).

## 6. Markdown rendering (debt)

sineva-ai returns `reply_content`, which can contain markdown. The transcript renders it inside `<p className="whitespace-pre-wrap">`, so users see raw `**` and `#` characters.

Target: render it as markdown. The library is not chosen. When one is, the change needs: a test with hostile input, no `dangerouslySetInnerHTML` on unsanitized model output, link handling decided (new tab, `rel`), and token-based styles for headings, lists and code. Record the library choice in the PR.
