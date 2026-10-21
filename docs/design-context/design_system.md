---
title: "Design System"
category: "design-context"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "design-system", "ui", "accessibility", "wcag", "theming", "components"]
summary: "The UI primitives in @sineva/ui, how theming works, the WCAG 2.2 AA baseline with computed contrast, which page states exist, and where the current UI deviates."
related_docs:
  - "README.md"
  - "design_tokens.md"
  - "ux_and_frontend_libraries.md"
  - "copywriting_and_brand.md"
  - "../project-structure/frontend_architecture.md"
  - "../engineering/state_management_redux.md"
  - "../development/known_issues_and_tech_debt.md"
---

# Design system

"Current" is what the code does. "Target" is decided but not built.

## Gotchas first

- The only page is `/`, and it is an engineering console, not a product UI: infrastructure status pills, a token budget, an envelope inspector and a presign test button around a per-product chat. Target: a UI centered on one chat with Sino ([ADR-0010](../decisions/0010-one-chat-with-mentions.md)). Do not treat the console layout as the design to extend.
- Dark mode is `[data-theme="dark"]` only. Tailwind's `dark:` variant is not tied to it (it follows the OS setting), so `dark:` classes misfire. Details in [design tokens](design_tokens.md).
- The 44 px touch target is a project rule, not an AA requirement. Some controls are smaller (listed below).
- Loading, error and not-found pages do not exist (R-31).
- Several numbers on the page are invented ("342 ms", "All Systems Nominal"). See [product model and wording](../product/product_model_and_wording.md).

## Components

`packages/ui/src/index.tsx` exports the primitives. `apps/web` has no other shared components besides the dashboard, the command palette and the theme toggle.

| Component | Variants and behavior |
| :--- | :--- |
| `Button` | `variant`: `primary`, `secondary`, `ghost`, `sun`. `size`: `sm` (min height 38 px), `md` (44 px), `lg` (48 px), `icon` (44 by 44 px). `asChild` renders through Radix `Slot` (used for links). `focus-visible` outline: 2 px in `--color-action-primary`, 2 px offset. Disabled: 50 percent opacity and no pointer events. |
| `Card` | Rounded, bordered surface. `elevated` switches to `--color-surface-elevated` and adds a shadow. |
| `Badge` | `tone`: `teal`, `sun`, `neutral`, `success`, `warning`. |
| `StatusPill` | `status`: `online`, `degraded`, `offline`, `standby`, with a dot and a label. |
| `Container` | `size`: `narrow` (`max-w-4xl`), `default` (`max-w-7xl`), `wide` (1440 px). Horizontal padding 16, 24, 32 px by breakpoint. |
| `cn` | `clsx` plus `tailwind-merge`. |

Rules for new UI:

- Use the primitives before writing a new one. Variants go through `class-variance-authority`.
- Reference semantic tokens (`bg-[var(--color-surface)]`). No hex (R-30). A search of `src/client` for hex colors returns nothing today. Components do use raw primitives (`--teal-50`, `--ink-950`, `--sun-100`) and Tailwind palette colors (`emerald-*`, `amber-*`, `rose-*`). Those do not change with the theme; prefer semantic tokens.
- Client code never imports `@/server/**` (R-08). Types come from `src/shared`.

## Theming

- `AppProviders` (`client/store/provider.tsx`) wraps the app in `next-themes` `ThemeProvider` with `attribute="data-theme"`, `defaultTheme="light"` and `enableSystem={false}`. The default is light, and the OS preference is ignored.
- `ThemeToggle` switches between `light` and `dark`. It renders a disabled placeholder until mounted, to avoid a hydration mismatch.
- `[data-theme="dark"]` in `globals.css` redefines the semantic tokens. There is no `.dark` class.

## Accessibility baseline

Target (R-32): WCAG 2.2 AA. Keyboard access, visible focus, AA contrast, `prefers-reduced-motion`.

Target size: WCAG 2.2 SC 2.5.8 (Target Size, Minimum, Level AA) asks for 24 by 24 CSS px. The project rule is 44 by 44 px (R-32). Both apply: 24 px is the floor for conformance, 44 px is what we build to. Source for 2.5.8: <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>.

### What is in place

- Reduced motion: `globals.css` shortens animation and transition durations to 0.01 ms under `prefers-reduced-motion: reduce`.
- Visible focus on `Button`. The command palette is a Radix `Dialog` (focus trap, Escape closes) with `aria-label` and a screen-reader title. `Cmd+K` or `Ctrl+K` toggles it.
- The chat input has an `sr-only` label. The tab-like filter has `aria-label`.
- Icon buttons have `aria-label`.

### Measured contrast

Computed on 2026-10-21 with the WCAG relative luminance formula on the token values in `globals.css` (not an audit tool run, and not every pair in the UI). Normal text needs 4.5:1. Non-text UI parts need 3:1.

| Pair | Light | Dark |
| :--- | :--- | :--- |
| `--color-text` on canvas | 17.05 | 17.16 |
| `--color-text-muted` on canvas | 7.87 | 9.37 |
| `--color-text-subtle` on canvas | 5.12 | 5.69 |
| `--color-text-subtle` on `--color-surface-muted` | 4.74 | 4.14 (fails 4.5) |
| `--color-action-primary` on canvas | 6.11 | 10.51 |
| `--color-text-inverse` on `--color-action-primary` | 6.42 | 10.77 |
| `--color-border-strong` on canvas (input border) | 1.52 | 2.17 |

- Dark `--color-text-subtle` on `--color-surface-muted` fails AA for normal text. The code does not use that pair today (subtle text sits on surface and elevated surfaces, 5.15 and 4.65 in dark).
- The input border (`--color-border-strong`) is below 3:1 in both themes. For a text field whose box is the only visible boundary, that likely fails SC 1.4.11.

### Current deviations

| Where | Problem | Rule |
| :--- | :--- | :--- |
| `Button` size `sm` (38 px) used in the dashboard header, hero and cards | Below the 44 px project rule. Above the 24 px AA floor. | 44 px |
| Category filter buttons in `sineva_dashboard.tsx` (min height 40 px) | Below 44 px | 44 px |
| Palette close button (`p-1` around a 16 px icon) | About 24 px, at the AA floor, below 44 px | 44 px |
| Category filter: `role="tablist"` and `role="tab"` on buttons | No `tabpanel`, no arrow-key movement. The roles promise behavior that is not there. | R-32 |
| Prompt `input` | `focus:outline-hidden` with only a border color change as the focus cue | R-32 |
| Filter chips and palette close button | No explicit focus style; they rely on the browser default | R-32 |
| Transcript | New replies are not announced (no `aria-live`) | R-32 |
| Input border | Contrast below 3:1 (above) | SC 1.4.11 |

## Page states

R-31 asks for loading, error and not-found states on every route.

| State | Current |
| :--- | :--- |
| Loading | No `loading.tsx`, no skeletons. The send button shows "Dispatching..." and is disabled while a message is in flight. `page.tsx` is `force-dynamic` and renders after the server fetch. |
| Error | No `error.tsx`. A failed chat call shows a toast. For 502 and 503 the toast has a Retry action. A thrown error in `page.tsx` (for example the database is down) has no boundary. |
| Not found | No `not-found.tsx`. Next.js shows its default 404. |
| Empty | The chat shows a dashed empty state. Its text is developer jargon (see [copywriting](copywriting_and_brand.md)). |
| Optimistic | The user message is appended to the transcript before the request starts. There is no pulse or typing indicator. |
| Streaming | None. The reply arrives whole. |

## Layout today

Header (brand, hardcoded infrastructure pills, command button, link to `/api-docs`, theme toggle), a hero card with stats, a token-budget card, the product grid with a category filter, then a chat card and an envelope inspector. Grid breakpoints: 12 columns from `lg`, the status pills from `xl`. Narrow screens (320 px) were not tested.

## Open question

The product cards use the lucide `Bot` icon. The wording rule says Sino is a companion, not a bot. Whether the icon should change belongs to the brand direction, which this repository does not define.

## Related

[Design tokens](design_tokens.md), [UX and frontend libraries](ux_and_frontend_libraries.md), [copywriting and brand](copywriting_and_brand.md), [frontend architecture](../project-structure/frontend_architecture.md), [known issues and tech debt](../development/known_issues_and_tech_debt.md).
