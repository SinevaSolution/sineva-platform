# AGENTS.md: apps/web/src/client

Browser-side UI: `components/` and the Redux store in `store/`. Rules R-08, R-14, R-27, R-30 to R-33, R-36; decisions ADR-0004, ADR-0010, ADR-0011. Current versus target and the rules for new UI: `docs/project-structure/frontend_architecture.md`. Store details: `docs/engineering/state_management_redux.md`.

## Boundary

- Never import `@/server/**` or `server-only`. ESLint and `architecture.test.ts` both fail on it. A type the client needs goes in `src/shared`.
- Wire types come from `@/shared` (`AgentView`, `ChatReplyView`). Primitives come from `@sineva/ui`.

## New UI

- Start as a server component in `src/app`. Mark `'use client'` only on the smallest leaf that needs state, effects or a browser API.
- Fetch on the server through the container. Do not fetch on mount in an effect, and do not copy server props into Redux.
- Selection, filter and page belong in the URL, not Redux.
- A new route gets `loading.tsx`, `error.tsx` and `not-found.tsx` as it needs them (R-31).
- Do not grow `sineva_dashboard.tsx` (777 lines). Extract small components when you touch it.
- Semantic tokens only (`var(--color-surface)`), no raw hex (R-30). Check both themes. Do not rely on Tailwind `dark:`: it is not tied to `data-theme`.
- Keyboard access, visible focus, AA contrast, `prefers-reduced-motion` (R-32).

## Redux

- Typed hooks only: `useAppDispatch`, `useAppSelector`.
- `makeStore()` is a factory called once per mount in `AppProviders`. Never export a store instance.
- State keys are `snake_case`. Redux holds client-only UI state. The current `agents_catalog` (server data copied in a `useEffect`) is debt, not a pattern.
- A new slice starts with a failing test in the `store.test.ts` style.

## Failures

- A failed call shows an error state. Never render invented content or a canned reply.
- The chat UI shows a toast for any failure, with Retry on 502 and 503, and appends nothing to the transcript.
- Never hardcode identity in new code (R-27). The dashboard's `usr_executive_01` is debt.

## Copy

- Sino is a "companion" (ID: "teman kerja", "teman AI"). Never "chatbot", "assistant", "asisten" or "agent" in text a customer reads. Code identifiers and `/api/v1/agents` keep "agent" (R-33).
- Write mentions as `@SinoHelp …`, no comma (R-36). Describe integrations as "the tools you already use" (R-35).
- Existing violations ("Multi-Agent", "6 Specialized Agents") are debt. Do not copy them.
- Fake stats ("342 ms", "All Systems Nominal", hardcoded status pills) are debt. Show real data or nothing.
- `reply_content` is markdown but renders as plain text today. Do not work around it with `dangerouslySetInnerHTML`.
