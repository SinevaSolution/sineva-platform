# AGENTS.md: apps/web/src/client

Browser-side UI: `components/` and the Redux store in `store/`. Rules R-08, R-14, R-27, R-30 to R-33, R-36; decisions ADR-0004, ADR-0010, ADR-0011. Current versus target and the rules for new UI: `docs/project-structure/frontend_architecture.md`. Store details: `docs/engineering/state_management_redux.md`.

## Boundary

- Never import `@/server/**` or `server-only`. ESLint and `architecture.test.ts` both fail on it. A type the client needs goes in `src/shared`.
- Wire types come from `@/shared` (`WorkspaceSpecialistRosterView`, `ChatReplyView`). A specialist's display copy, accent and starter prompts come from the static manifest `@/shared/specialists/manifest`, not from a fetch. Primitives come from `@sineva/ui`.

## New UI

- Start as a server component in `src/app`. Mark `'use client'` only on the smallest leaf that needs state, effects or a browser API.
- Fetch on the server through the container. Do not fetch on mount in an effect, and do not copy server props into Redux.
- Selection, filter and page belong in the URL, not Redux.
- A new route gets `loading.tsx`, `error.tsx` and `not-found.tsx` as it needs them (R-31).
- Do not grow `sineva_dashboard.tsx` (777 lines). Extract small components when you touch it.
- Semantic tokens only (`var(--color-surface)`), no raw hex (R-30). Check both themes. Never write `dark:`; semantic tokens swap under `data-theme` by themselves (lint bans it, with hex, `rgb(`, arbitrary `z-[n]` and physical-direction classes such as `ml-` or `left-`).
- Keyboard access, visible focus, AA contrast, `prefers-reduced-motion` (R-32).

## Components

- Every shared component is an `SN` component from `@sineva/ui` ([ADR-0028](../../../../docs/decisions/0028-sn-component-prefix-and-form-controls.md)): `SNButton`, `SNIconButton`, `SNInput`, `SNField`, `SNSelect`, `SNCombobox`, `SNDialog`, `SNDropdownMenu`, `snToast`. A new shared component gets the `SN` prefix and the `sn_x/` folder; a feature component keeps its domain name.
- Dropdown fields are `SNSelect` (short list) or `SNCombobox` (long, searchable). A native `<select>` fails lint (`sineva-design/no-native-select`). Do not import `@radix-ui/*` or `sonner` in app code; use the `SN` wrapper (`snToast.error(...)`, not `toast.error(...)`).
- An icon-only button is an `SNIconButton` with a `label` (accessible name and tooltip). Menus use `SNDropdownMenu`, confirmations `SNConfirmDialog`, side sheets `SNDrawer`.
- A place that can be empty is a preset in `components/ui/empty_states.ts` (icon for compact places, Sino pose for pages, size, and keys in the `empty` namespace, EN and ID) rendered with `<PresetEmptyState preset="...">`. Never write ad-hoc "no items" text; `empty_state_usage.test.ts` fails on it. Add the entry to the registry and both catalogs together; the `/dev/ui` gallery lists every preset.
- Without tailwind-merge in `@sineva/ui`, do not restyle a variant with `className`; pick the right size or variant, or add one to the component.

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

- Every string a customer reads is a message key in `apps/web/messages/en.json` and `id.json` (ADR-0023). Client components call `useTranslations('namespace')` from `@/i18n/provider`; server components `await getTranslations('namespace')` from `@/i18n/server`. Add both languages in the same change. Use literal keys (`t('sign_in.title')`), never template literals. A model file that picks a message by id keeps the key as a string literal. Use `t.rich` when a link or `<strong>` sits inside a sentence.
- Error text comes from `useApiErrorText()` (machine code to `errors.api.*`), never from `ApiError.message`.
- `npm run lint` rejects literal UI text; `npm run test` checks key parity, unused keys, banned words, protected names and mention form.
- Dates, numbers and money go through `@sineva/ui/format` (`formatDate`, `formatRelativeTime`, `formatIdr`), not hand-built strings.
- No engineering words in a customer string: OCR, embedding, chunk, vector, index and indexing, ingest, token, RAG, payload, webhook, JSON, BFF, and the Indonesian counterparts. The `technical_term` rule in `@sineva/i18n` fails `npm run test` for either catalog; say what it means for the person ("Sino is reading your file"). File sizes go through `formatFileSize` (KB, MB, GB), never raw bytes.
- Sino is a "companion" (ID: "teman kerja", "teman AI"). Never "chatbot", "assistant", "asisten" or "agent" in text a customer reads. Code identifiers and `/api/v1/agents` keep "agent" (R-33).
- Write mentions as `@SinoHelp …`, no comma (R-36). Describe integrations as "the tools you already use" (R-35).
- Existing violations ("Multi-Agent", "6 Specialized Agents") are debt. Do not copy them.
- Fake stats ("342 ms", "All Systems Nominal", hardcoded status pills) are debt. Show real data or nothing.
- `reply_content` is markdown but renders as plain text today. Do not work around it with `dangerouslySetInnerHTML`.
