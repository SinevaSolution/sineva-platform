---
title: "State Management with Redux Toolkit"
category: "engineering"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "redux", "redux-toolkit", "state-management", "react", "snake-case"]
summary: "The Redux store as built: the two slices and their state, the per-mount makeStore pattern, the client/server boundary, what belongs in Redux, and the current misuse to avoid copying."
related_docs:
  - "../project-structure/frontend_architecture.md"
  - "../project-structure/clean_architecture_layers.md"
  - "coding_standards.md"
  - "design_pattern.md"
  - "testing_strategy.md"
---

# State Management with Redux Toolkit

Redux Toolkit and `react-redux` live in `apps/web/src/client/store/`. Read [frontend architecture](../project-structure/frontend_architecture.md) first: it says where Redux fits in the target UI. "Current" is the code today, "Target" is decided and not built.

## 1. Files

| File | Exports |
| :--- | :--- |
| `store.ts` | `makeStore()`, types `AppStore`, `RootState`, `AppDispatch` |
| `hooks.ts` | `useAppDispatch`, `useAppSelector` (typed) |
| `provider.tsx` | `AppProviders`: Redux `Provider`, `next-themes` `ThemeProvider`, sonner `Toaster` |
| `slices/agent_slice.ts` | `agentSlice`, its actions, `AgentSliceState`, `ChatTranscriptItem` |
| `slices/workspace_slice.ts` | `workspaceSlice`, its actions, `WorkspaceSliceState` |

Always use the typed hooks. Do not import `useDispatch` or `useSelector` from `react-redux` in components.

## 2. `makeStore` per mount

`makeStore()` is a factory, not a module-level singleton. `AppProviders` calls it once per mount through `React.useState(() => makeStore())` and passes the result to `<Provider>`.

Why a factory (the usual reasoning for Redux with server rendering; the code does not state it): a module-level store would be shared by every server render in the same Node process, so one visitor's state could end up in another's HTML. The factory gives each mount its own store. Tests rely on the same property: `makeStore()` returns a clean store every time (`store.test.ts`).

Gotchas:

- `AppProviders` sits in the root layout, so there is one store per browser tab session. It survives client-side navigation and is lost on a full reload.
- Nothing is persisted. A reload clears the selected companion, the filter and every transcript.
- Slice files must not export a store instance, and code must not import a store directly. Components reach the store through the hooks.

## 3. Root state

`makeStore` registers two reducers. State keys are `snake_case`, so server payloads can be stored without key mapping (R-23).

| State key | Slice | Holds |
| :--- | :--- | :--- |
| `agent_companion` | `agent_slice.ts` | Companion UI and chat state |
| `workspace` | `workspace_slice.ts` | Workspace display and orchestrator mode |

### `agent_companion`

| Field | Type | Meaning |
| :--- | :--- | :--- |
| `selected_agent_slug` | `string` | Selected companion. Initial value `sinofinance`. |
| `active_category_filter` | `AgentCategory \| 'all'` | Roster filter. Initial `all`. |
| `command_palette_open` | `boolean` | Command palette visibility. |
| `is_dispatching_message` | `boolean` | True while a chat request is in flight. |
| `agents_catalog` | `AgentView[]` | Companions copied from the server page props. Initial `[]`. |
| `transcripts_by_slug` | `Record<string, ChatTranscriptItem[]>` | Messages per companion slug. |
| `session_ids_by_slug` | `Record<string, string>` | The sineva-ai `session_id` per companion. sineva-ai creates the session on the first turn, and later turns send the stored id. |

`ChatTranscriptItem`: `id`, `agent_slug`, `sender_role` (`'user' \| 'agent'`), `message_text`, optional `citations` (`ChatCitationView[]`), `total_tokens`, `latency_ms`, and `created_at`.

Actions: `setSelectedAgentSlug`, `setActiveCategoryFilter`, `setCommandPaletteOpen`, `setAgentsCatalog`, `setDispatchingMessage`, `setChatSessionId`, `appendChatTranscript`.

### `workspace`

Fields: `workspace_id`, `workspace_slug`, `workspace_name`, `subscription_tier`, `monthly_token_quota`, `monthly_tokens_consumed`, `orchestrator_mode` (`'autonomous_handoff' \| 'human_in_the_loop'`). Actions: `incrementTokensConsumed` (ignores negative amounts), `setOrchestratorMode`.

Debt: the initial values are hardcoded constants (`wks_sineva_enterprise_01`, `Sineva Global HQ`, a quota and a consumed count), not data from the server. They are placeholders for a workspace model that has no endpoint yet. Do not build features that read them as real.

## 4. Boundary

- Slices import types from `@/shared` (`AgentView`, `AgentCategory`, `ChatCitationView`), never from `@/server/**` (R-08). ESLint and `architecture.test.ts` fail on it.
- Reducers are plain Redux Toolkit reducers: Immer lets them mutate the draft.
- Network calls are not in the store. There are no thunks and no RTK Query: the dashboard calls `fetch` itself and dispatches the result. The earlier docs that mentioned `createAsyncThunk` described something that does not exist.

## 5. What belongs in Redux

| State | Where | Examples |
| :--- | :--- | :--- |
| Client-only UI state shared by distant components | Redux (Current and Target) | `command_palette_open`, the in-progress chat transcript and session ids (no persistence exists yet) |
| Selection, filter, page, anything a link should restore | URL (Target) | Selected companion, category filter. Today these are in Redux: `selected_agent_slug`, `active_category_filter` |
| Data that came from the server | Server component props or a server fetch (Target) | The agent list. Today copied into `agents_catalog` |
| One component's own state | `useState` | The composer text (`promptInput`), preview strings |
| Theme | `next-themes` (`data-theme` attribute) | Light and dark |

Current misuse, do not copy:

- `agents_catalog` duplicates server data. The dashboard dispatches `setAgentsCatalog(initialAgents)` in a `useEffect` after mount and falls back to the prop until then. There are two sources of truth for the same list.
- `is_dispatching_message` is request-local state kept globally.

## 6. Adding or changing a slice

1. Write the failing test first in `src/__tests__/store.test.ts` style: `const store = makeStore()`, dispatch, assert on `store.getState()`. No React or DOM is needed (R-01).
2. Create `slices/<name>_slice.ts` with `createSlice`. Use a `snake_case` `name` and `snake_case` state keys.
3. Import wire types from `@/shared`. Do not import `@/server`.
4. Register the reducer in `makeStore` under a `snake_case` key.
5. Export action creators with `camelCase` verb names, as the existing slices do.
6. Check first whether the state is really client-only. If it is a selection or server data, use the URL or props ([frontend architecture](../project-structure/frontend_architecture.md)).
