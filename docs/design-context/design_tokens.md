---
title: "Design Tokens & Typography Scale"
category: "design-context"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Design & Engineering"
tags: ["sineva", "design-tokens", "css-variables", "typography", "theming", "dark-mode"]
summary: "Three-layer design token specification (Primitive, Semantic, Component) across Light and Dark themes, plus the Plus Jakarta Sans and Geist Mono typography scale."
related_docs:
  - "design_system.md"
  - "ux_and_frontend_libraries.md"
---

# Design Tokens & Typography Scale

`sineva-platform` enforces a strict **Three-Layer Token Architecture** (`Primitive` → `Semantic` → `Component`). Components in `@sineva/ui` and `apps/web` must reference **Semantic Tokens** (`var(--color-canvas)`, `var(--color-action-primary)`) rather than raw hex values.

---

## 1. Layer 1: Primitive Color Tokens (`:root`)

```css
:root {
  /* Sineva Signature Teal Scale */
  --teal-50:  #eefbfa;
  --teal-100: #d5f5f2;
  --teal-200: #afeae6;
  --teal-300: #7ad8d4;
  --teal-400: #3fbec0;
  --teal-500: #1aa3a8;
  --teal-600: #138289;
  --teal-700: #13686f;
  --teal-800: #155359;
  --teal-900: #16454b;

  /* Editorial Ink Neutral Scale */
  --ink-50:   #f8fafc;
  --ink-100:  #f1f5f9;
  --ink-200:  #e2e8f0;
  --ink-300:  #cbd5e1;
  --ink-400:  #94a3b8;
  --ink-500:  #64748b;
  --ink-600:  #475569;
  --ink-700:  #334155;
  --ink-800:  #1e293b;
  --ink-900:  #0f172a;
  --ink-950:  #060b14;

  /* Accent & Signal Primitives */
  --aqua-400: #22d3ee;
  --sun-100:  #fef3c7;
}
```

---

## 2. Layer 2: Semantic Theme Tokens (Light vs. Dark)

| Semantic Token | Light Theme (`:root`) | Dark Theme (`.dark` / `[data-theme="dark"]`) | Purpose |
| :--- | :--- | :--- | :--- |
| `--color-canvas` | `var(--ink-50)` (`#f8fafc`) | `var(--ink-950)` (`#060b14`) | Root page background canvas |
| `--color-surface` | `#ffffff` | `var(--ink-900)` (`#0f172a`) | Primary cards, workspace panels, modals |
| `--color-surface-elevated` | `var(--ink-100)` (`#f1f5f9`) | `var(--ink-800)` (`#1e293b`) | Hover states, nested code/telemetry blocks |
| `--color-text` | `var(--ink-900)` (`#0f172a`) | `var(--ink-50)` (`#f8fafc`) | Primary headings and body copy |
| `--color-text-muted` | `var(--ink-600)` (`#475569`) | `var(--ink-400)` (`#94a3b8`) | Secondary metadata, timestamps, labels |
| `--color-border` | `var(--ink-200)` (`#e2e8f0`) | `var(--ink-800)` (`#1e293b`) | Subtle 1px structural dividers and card borders |
| `--color-action-primary` | `var(--teal-600)` (`#138289`) | `var(--teal-400)` (`#3fbec0`) | Primary CTA buttons, active rings, links |
| `--color-action-hover` | `var(--teal-700)` (`#13686f`) | `var(--teal-300)` (`#7ad8d4`) | Primary CTA hover state |
| `--color-accent-signal` | `var(--aqua-400)` (`#22d3ee`) | `var(--aqua-400)` (`#22d3ee`) | Live streaming indicators & AI pulse badges |
| `--color-highlight-warm` | `var(--sun-100)` (`#fef3c7`) | `rgba(254, 243, 199, 0.14)` | Callout highlights and warm tags |

---

## 3. Companion Signature Accent Tokens

Each of the 6 specialized AI companions has a distinct visual accent token stored in `avatar_accent_token`:
- **`@SinoPeople`** (`sino-people`): `--teal-500` (People & Culture Warm Teal)
- **`@SinoFinance`** (`sino-finance`): `--teal-700` (Fiscal Precision Deep Teal)
- **`@SinoSales`** (`sino-sales`): `--aqua-400` (Revenue Velocity Electric Aqua)
- **`@SinoSocial`** (`sino-social`): `--sun-100` / `--teal-400` (Creative Editorial Accent)
- **`@SinoHelp`** (`sino-help`): `--teal-600` (Service Reliability Teal)
- **`@SinoInsights`** (`sino-insights`): `--ink-800` / `--aqua-400` (Analytical Deep Ink & Cyan)

---

## 4. Typography & Spatial Scale

- **Primary UI & Display Sans**: `'Plus Jakarta Sans'`, system-ui, -apple-system, sans-serif (`--font-sans`)
- **Technical Telemetry, Slugs & Code**: `'Geist Mono'`, ui-monospace, SFMono-Regular, monospace (`--font-mono`)
- **Type Scale**:
  - Hero Headline: `clamp(2rem, 3.2vw, 2.75rem)`, `font-weight: 700`, `letter-spacing: -0.025em`
  - Section Header: `1.375rem` (`22px`), `font-weight: 600`, `letter-spacing: -0.015em`
  - Body Copy: `0.9375rem` (`15px`), `line-height: 1.6`
  - Monospace Badge / Metric: `0.75rem` (`12px`), `font-variant-numeric: tabular-nums`
