---
title: "Design Tokens"
category: "design-context"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "design-tokens", "css-variables", "theming", "dark-mode", "typography", "tailwind-v4"]
summary: "The CSS variables actually defined in apps/web/src/app/globals.css, how the dark theme is applied, the dark: variant gap, and the fonts."
related_docs:
  - "README.md"
  - "design_system.md"
  - "ux_and_frontend_libraries.md"
  - "../governance/agent_rules.md"
  - "../development/known_issues_and_tech_debt.md"
---

# Design tokens

Source of truth: `apps/web/src/app/globals.css`. If this document and that file disagree, the file wins and this document is wrong.

"Current" is what the code does. "Target" is decided but not built.

## Gotchas first

- Dark mode is `[data-theme="dark"]` only. There is no `.dark` class and no `prefers-color-scheme` rule for the semantic tokens.
- Tailwind v4's `dark:` variant defaults to `prefers-color-scheme`. `globals.css` has no `@custom-variant dark`, so `dark:` classes follow the OS setting, not the app's theme. The app starts in light and ignores the OS (`enableSystem={false}`). A user on a dark OS who sees the light theme gets dark-variant colors on light surfaces. A user on a light OS who toggles dark gets no dark-variant colors at all. Current users of `dark:`: `Badge` in `packages/ui/src/index.tsx`, and the dashboard (emerald status text, product icon tile).
- There is no `@theme` block. Tailwind does not generate utilities such as `bg-canvas`; components write `bg-[var(--color-canvas)]`.
- Raw primitives (`--teal-*`, `--ink-*`, `--sun-*`, `--aqua-*`) do not change with the theme. Use them only where a fixed color is intended.
- Layer 3 is one token (`--ease-out-expo`) and nothing uses it.

## Layers

| Layer | Contents | Where |
| :--- | :--- | :--- |
| 1 Primitive | Raw palette: teal, aqua, sun, ink | `:root` |
| 2 Semantic | Meaning-based colors: canvas, surface, text, border, action | `:root` (light), `[data-theme="dark"]` (dark) |
| 3 Motion | `--ease-out-expo` | `:root` |

Components reference layer 2 (R-30). No component hardcodes hex.

## Layer 1: primitives

| Token | Value | | Token | Value |
| :--- | :--- | :--- | :--- | :--- |
| `--teal-50` | `#effaf8` | | `--ink-50` | `#fbf9f5` |
| `--teal-100` | `#d7f3ee` | | `--ink-100` | `#f4f0e8` |
| `--teal-200` | `#b2e6de` | | `--ink-200` | `#e8e2d5` |
| `--teal-500` | `#0fa38c` | | `--ink-300` | `#d5ccb8` |
| `--teal-600` | `#0b8471` | | `--ink-500` | `#6e6a61` |
| `--teal-700` | `#0a6b5c` | | `--ink-600` | `#524e46` |
| `--teal-800` | `#0b554a` | | `--ink-800` | `#262420` |
| `--teal-900` | `#093b34` | | `--ink-900` | `#181714` |
| `--aqua-400` | `#3dd9c3` | | `--ink-950` | `#0b1516` |
| `--sun-100` | `#fef3c7` | | `--sun-500` | `#f59e0b` |

Steps that do not exist: `--teal-300`, `--teal-400`, `--ink-400`, `--ink-700`. Do not reference them.

## Layer 2: semantic tokens

| Token | Light | Dark |
| :--- | :--- | :--- |
| `--color-canvas` | `--ink-50` | `#0b1516` |
| `--color-surface` | `#ffffff` | `#112022` |
| `--color-surface-elevated` | `#ffffff` | `#16292c` |
| `--color-surface-muted` | `--ink-100` | `#1b3236` |
| `--color-text` | `--ink-900` | `#f3f7f6` |
| `--color-text-muted` | `--ink-600` | `#a6bdbb` |
| `--color-text-subtle` | `--ink-500` | `#789492` |
| `--color-text-inverse` | `#ffffff` | `#081213` |
| `--color-border` | `--ink-200` | `#213b3f` |
| `--color-border-strong` | `--ink-300` | `#2e5257` |
| `--color-action-primary` | `--teal-700` | `--aqua-400` |
| `--color-action-primary-hover` | `--teal-800` | `--teal-200` |
| `--color-accent-highlight` | `--aqua-400` | `--sun-500` |

- `--color-text-inverse` is the text color on `--color-action-primary`. It flips to dark text in the dark theme because the primary color becomes light.
- `--color-surface` and `--color-surface-elevated` are the same white in the light theme, so `elevated` cards differ only by shadow there.
- Contrast numbers for the pairs in use are in [design system](design_system.md).
- There are no tokens for focus ring color, shadows, radii or spacing. Components use Tailwind's scale and a hardcoded `rounded-xl` or `rounded-2xl`.
- `--color-accent-highlight` is defined and not referenced by any component.

## Layer 3: motion

`--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)`. `Button` and `Card` in `@sineva/ui` write the same curve inline (`ease-[cubic-bezier(0.16,1,0.3,1)]`, 200 ms) instead of using the variable, and use `transition-all`. A `prefers-reduced-motion: reduce` rule in `globals.css` shortens animations and transitions to 0.01 ms.

## Theme mechanism

`next-themes` sets `data-theme="light"` or `data-theme="dark"` on `<html>` (`client/store/provider.tsx`). Default light, no system detection. `suppressHydrationWarning` is on `<html>` in `app/layout.tsx` for the attribute.

Target: make `dark:` follow the same attribute. In Tailwind v4 this is a `@custom-variant` declaration in `globals.css` that matches `[data-theme="dark"]` and its descendants (recalled from the Tailwind v4 dark mode docs, not verified in this repository). The alternative is to remove every `dark:` class and use semantic tokens only, which is the better fit with R-30. Either way, fix it as one change with a visual check in both themes.

## Typography

| Role | Font | Variable | Loaded by |
| :--- | :--- | :--- | :--- |
| UI and display | Plus Jakarta Sans | `--font-jakarta` | `next/font/google` in `app/layout.tsx` (latin subset, `display: swap`) |
| Code, slugs, metrics | Geist Mono | `--font-geist-mono` | same |

`globals.css` sets `html, body` to `var(--font-jakarta)` with system fallbacks, and `code, pre, kbd` to `var(--font-geist-mono)` with monospace fallbacks. There is no `--font-sans` or `--font-mono` variable and no type-scale token: sizes are Tailwind classes in the components (for example the page heading is `text-3xl` up to `lg:text-[2.65rem]`, bold, tight tracking).

## Product accent tokens

A specialist's accent is `accent_key`, a fixed 13-value enum in the specialist manifest (`src/shared/specialists/manifest.ts`, [ADR-0024](../decisions/0024-specialist-manifest-and-catalog-split.md)). It replaces the old seeded `accent_token` (a CSS variable name that no UI read and that data could have set to anything). No data can inject a color: the key picks one of the ramps defined in CSS.

| Specialist | `accent_key` | CSS variable today |
| :--- | :--- | :--- |
| SinoPeople | `people` | `--accent-people` |
| SinoFinance | `finance` | `--accent-finance` |
| SinoSales | `sales` | `--accent-sales` |
| SinoSocial | `social` | `--accent-social` |
| SinoHelp | `help` | `--accent-help` |
| SinoInsights | `insights` | `--accent-insights` |
| Sino (orchestrator, no manifest entry) | `brand` in the UI | `--accent-brand` |

The enum also reserves `desk`, `write`, `shop`, `guard`, `tax`, `legal` and `ops` for waves 2 and 3. Their ramps are not in `globals.css` yet, so `specialistAccent()` renders any key without a ramp as the brand accent instead of inventing a color.

## Adding or changing a token

1. Add the semantic token in `:root` and in `[data-theme="dark"]`, in the same change.
2. Compute contrast for every text pair it creates, in both themes. Normal text 4.5:1, non-text 3:1.
3. Use it as `var(--token)` in components. Do not add hex to `src/client` (check: `grep -rnE "#[0-9a-fA-F]{3,8}\b" apps/web/src/client`).
4. Update this document.

## Related

[Design system](design_system.md), [UX and frontend libraries](ux_and_frontend_libraries.md), [agent rules](../governance/agent_rules.md) (R-30), [known issues and tech debt](../development/known_issues_and_tech_debt.md).
