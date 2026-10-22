---
title: "UX and Frontend Libraries"
category: "design-context"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "frontend", "libraries", "radix", "cmdk", "sonner", "tailwind-v4", "ux", "dependencies"]
summary: "Which front-end packages are installed and which are used, how motion, the command palette and toasts behave today, and the UX patterns still to build."
related_docs:
  - "README.md"
  - "design_system.md"
  - "design_tokens.md"
  - "../engineering/state_management_redux.md"
  - "../project-structure/frontend_architecture.md"
  - "../decisions/0010-one-chat-with-mentions.md"
  - "../development/known_issues_and_tech_debt.md"
---

# UX and frontend libraries

Sources: `apps/web/package.json`, `packages/ui/package.json`, and a search of `apps/web/src` and `packages/ui/src` for imports on 2026-10-21.

"Current" is what the code does. "Target" is decided but not built.

## Gotchas first

- Many packages are installed and never imported: `gsap`, `recharts`, `vaul`, `react-hook-form`, `@hookform/resolvers`, `swagger-ui-react`, and six Radix packages. They add install size and audit surface for nothing. Do not read this list as the stack in use.
- Motion today is CSS transitions and keyframes only. There is no GSAP code. The unused `motion` package was removed (FR-UX-42); GSAP is the one approved motion library and loads lazily where CSS cannot do the job.
- `ioredis` is installed and a client factory exists (`server/infrastructure/cache/redis_client.ts`), but nothing calls it. The cache is an in-memory `Map`.
- UI libraries use `^` ranges in `package.json`. The framework (`next`, `react`, `react-dom`, `tailwindcss`) and the three Prisma packages are pinned to exact versions.

## Package inventory

| Capability | Package | Used in | Status |
| :--- | :--- | :--- | :--- |
| Styling | `tailwindcss` 4.3.3, `@tailwindcss/postcss` | `globals.css`, every component | Used |
| Variants and class merging | `class-variance-authority`, `clsx`, `tailwind-merge` | `packages/ui` | Used |
| Polymorphic slot | `@radix-ui/react-slot` | `Button` `asChild` | Used |
| Dialog | `@radix-ui/react-dialog` | command palette | Used |
| Command menu | `cmdk` | command palette | Used |
| Toasts | `sonner` | `Toaster` in `provider.tsx`, toasts in the dashboard | Used |
| Theming | inline script and `useTheme` (compro port, `next-themes` removed) | `theme_script.tsx`, `use_theme.ts`, `theme_toggle.tsx` | Used |
| Icons | `lucide-react` | dashboard, palette, theme toggle, `/api-docs` | Used |
| State | `@reduxjs/toolkit`, `react-redux` | `client/store` | Used |
| Validation | `zod` | server DTOs and the gateway | Used (server only) |
| Avatar, dropdown menu, scroll area, switch, tabs, tooltip | `@radix-ui/react-avatar`, `-dropdown-menu`, `-scroll-area`, `-switch`, `-tabs`, `-tooltip` | nowhere | Unused |
| Motion | `gsap` | nowhere | Unused |
| Charts | `recharts` | nowhere | Unused |
| Drawer | `vaul` | nowhere | Unused |
| Forms | `react-hook-form`, `@hookform/resolvers` | nowhere | Unused |
| API viewer | `swagger-ui-react` (and `@types/swagger-ui-react`) | nowhere | Unused |
| Redis client | `ioredis` | `redis_client.ts`, never called | Unused |

Policy (Target): add a package when a change uses it, in the same change. Remove or adopt each unused package. Do not adopt one just because it is installed; adopting means a use, a test, and a line in this table. The category filter, for example, should use the installed Radix `Tabs` (which brings the missing arrow-key and panel semantics) or plain buttons without `role="tab"`.

## Motion

- Current: `Button` and `Card` use `transition-all duration-200` with `cubic-bezier(0.16, 1, 0.3, 1)` written inline. The token `--ease-out-expo` has the same curve and is unused.
- A global `prefers-reduced-motion: reduce` rule in `globals.css` shortens durations to 0.01 ms.
- Target: if motion is added, use it for feedback (state change, new reply), keep durations short, and keep the reduced-motion rule working. Use CSS first and load GSAP lazily only where CSS cannot do the job.

## Command palette

`client/components/command_palette.tsx`, built on Radix `Dialog` and `cmdk`.

- `Cmd+K` (macOS) or `Ctrl+K` toggles it, from anywhere on the page. State: `agent_companion.command_palette_open` in Redux.
- Group "Specialized AI Companions": one item per product in the Redux catalog. Search text is display name, slug and role title. Selecting an item sets the selected slug and closes the palette.
- Group "Orchestrator & Developer Tools": enable "Autonomous Multi-Agent Handoff" (sets `orchestrator_mode`), open `/api-docs`, open `/api/v1/health` in a new tab.
- There is no department filter and no presign item in the palette.
- Current deviations: the handoff label breaks the wording rule, the `/api-docs` item says "Swagger UI", and the close button is below 44 px. See [product model and wording](../product/product_model_and_wording.md) and [design system](design_system.md).
- `orchestrator_mode` (`human_in_the_loop` or `autonomous_handoff`) lives only in the Redux workspace slice and is sent inside `context_metadata`. No platform code reads it, and whether `sineva-ai` acts on it was not verified. Treat the toggle as a stub.

## Toasts

`sonner`, bottom right, `richColors`, close button.

- Success after a reply: "@<product> responded" with the latency and model id.
- Failure: the `message` field of the error envelope, as is. For 502 and 503 the toast has a Retry action that re-sends the same prompt without duplicating the user message in the transcript. A network failure shows a fixed message with a Retry action.
- Current gap: showing `message` verbatim is unsafe for 500, whose message is the raw error text. Target copy for each status is in [copywriting and brand](copywriting_and_brand.md).

## State and data flow

- Current: the home page loads agents on the server (`GetAgentsUseCase`) and passes them to `SinevaDashboard`, which copies them into Redux in a `useEffect`. Selection, category filter, transcripts and session ids live in the `agent_companion` slice. Nothing is in the URL, and a reload clears the transcripts and session ids. The platform stores no chat messages (the `chat_*` tables have no code).
- Target: URL state for the selected product or conversation and the filter; server data read where it is needed instead of copied into the store; transcripts persisted by `session_id`. See [state management](../engineering/state_management_redux.md) and the [roadmap](../development/roadmap.md).

## Patterns still to build

| Pattern | Why | Notes |
| :--- | :--- | :--- |
| One chat with @mention | [ADR-0010](../decisions/0010-one-chat-with-mentions.md) | Parse `@Product` at the start of a message; no mention goes to Sino. Show which product answered (`routed_agent_slug`, `handle`). |
| Markdown reply rendering | `reply_content` is Markdown; the UI prints it as plain text | Render with a sanitizing renderer. Do not use `dangerouslySetInnerHTML` on model output. |
| Loading, error, not-found routes | R-31 | `loading.tsx`, `error.tsx`, `not-found.tsx` under `src/app`. |
| Honest status | The status pills and stats are hardcoded | Read `/api/v1/health` once it has real probes, or remove the pills. |
| Forms | None exist | If a form is added, use `react-hook-form` with a Zod resolver, since both are installed. |

## Related

[Design system](design_system.md), [design tokens](design_tokens.md), [copywriting and brand](copywriting_and_brand.md), [state management with Redux](../engineering/state_management_redux.md), [known issues and tech debt](../development/known_issues_and_tech_debt.md).
