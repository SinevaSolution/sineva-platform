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
- Dark mode is `:root[data-theme='dark']` only and no component uses `dark:` (lint bans it). Colors come from the vendored sineva-compro tokens. Details in [design tokens](design_tokens.md).
- The 44 px touch target is a project rule, not an AA requirement. Some controls are smaller (listed below).
- Loading, error and not-found pages do not exist (R-31).
- Several numbers on the page are invented ("342 ms", "All Systems Nominal"). See [product model and wording](../product/product_model_and_wording.md).

## Components

**Naming rule ([ADR-0028](../decisions/0028-sn-component-prefix-and-form-controls.md)).** Every design-system component and type exported from `@sineva/ui` starts with `SN` (`SNButton`, `SNButtonProps`, `SNSelect`). Files are snake_case with the prefix: `packages/ui/src/primitives/sn_button/sn_button.tsx`, `sn_button.test.tsx`, `sn_button.gallery.tsx`, one folder per component. Hooks and helpers keep normal names (`cx`, `focusRing`, `snToast`, `formatDate`). `packages/ui/src/__tests__/naming.test.ts` fails on an export that breaks the rule. Feature components in `apps/web/src/client/components/<feature>/` keep domain names (`ProfileForm`, `AppShell`); the shared Sino pieces in `components/ui/` carry the prefix (`SNSinoFigure`, `SNSinoLoop`, `SNSpecialistTile`).

`packages/ui/src/index.ts` exports the components below; the package layout is in [turborepo workspaces](../project-structure/turborepo_workspaces.md). Static class maps and `cx`, never `tailwind-merge` or `cva`. Strings (labels, aria names, empty text) always come in as props so the app translates them.

| Group | Components |
| :--- | :--- |
| Actions | `SNButton` (variants `primary`, `dark`, `secondary`, `ghost`, `danger`, `link`; sizes `xs` 28, `sm` 36, `md` 40 (44 on coarse pointers), `lg` 44, the small ones keep a 44 px hit area; `shape` `square` or `pill`; `loading` keeps the label and sets `aria-busy`; `asChild` for links), `SNIconButton` (`label` is required and doubles as the tooltip; optional `tooltip` text, `pressed` for toggles), `SNSpinner` |
| Inputs | `SNField` (label, hint, error, `trailing`; wires `aria-describedby` and sets `aria-invalid` only with an error; the control inside reads it from context), `SNInput` (adornments, password reveal), `SNDropzone` (file picker and drag-and-drop, controlled file selection, format/size/count validation, disabled state and translated errors), `SNTextarea` (counter row, announced only near the limit), `SNSelect` (single choice, Radix Select), `SNCombobox` (single choice with search, Radix Popover plus cmdk), `SNCheckbox`, `SNRadioGroup` (`list` or `cards`), `SNSwitch`, `SNSegmented`, `SNFormSection` |
| Display and state | `SNCard`, `SNBadge` (tones include `review`, `running`, `paused`, `failed`, always icon plus text), `SNPill`, `SNStatusChip`, `SNAvatar`, `SNListCard`, `SNSkeleton`, `SNBanner`, `SNProgressBar`, `SNSinoStill`, `SNEmptyState`, `SNErrorState` (error copy maps from the machine code, `errorCodeToMessageKey`) |
| Overlays | `SNTooltip` and `SNTooltipProvider`, `SNPopover`, `SNDropdownMenu` (with `Trigger`, `Content`, `Item`, `Separator`, `Label`), `SNDialog`, `SNConfirmDialog`, `SNDrawer` (side sheet, bottom sheet under 768 px unless `mobile="side"`), `SNToaster` and `snToast` (Sonner restyled with tokens) |

Dropdown fields: use `SNSelect` for a short list and `SNCombobox` for a long or searchable one (time zones). A native `<select>` is banned in app code (`sineva-design/no-native-select`). Radix Select rejects an empty-string item value, so `SNSelect` maps `''` to an internal sentinel and a "Not set" option still works.

`SNIconButton`, `SNInput` with its password reveal and `SNDrawer` render an `SNTooltip`, so an `SNTooltipProvider` must sit above them (`AppProviders` mounts one). Radix Dialog returns focus only to its own trigger; `SNDialog` and `SNDrawer` are controlled, so they remember the opener and restore focus themselves.

Rules for new UI:

- Use the components before writing a new one. Variants are static maps in the component file.
- Reference semantic tokens as utilities (`bg-surface`, `text-text-secondary`, `bg-action-primary`). No hex, no `rgb(`, no Tailwind palette colors, no `dark:`, no arbitrary `z-[n]` (R-30; `packages/ui` and `src/client` lint enforce it). The Google sign-in logo is the one documented exception (third-party brand colors).
- Without `tailwind-merge`, a caller `className` is for layout only. Two utilities of the same property on one element are ordered by the stylesheet, not by the string; add a size or variant to the component's map instead, or use the `!` modifier for a deliberate one-off.
- Client code never imports `@/server/**` (R-08). Types come from `src/shared`.

## Theming

- An inline script (`ThemeScript` in the root layout, with the CSP nonce) sets `<html data-theme>` before the first paint. The first visit follows the OS, an explicit choice is stored under `sineva-theme`. `next-themes` is gone.
- `useTheme` (`client/lib/use_theme.ts`) reads the attribute and `ThemeToggle` and the user menu switch it. `ThemeFollowSystem` (in `AppProviders`) follows OS changes until a choice is stored.
- `theme-dark.css` redefines the semantic tokens under `:root[data-theme='dark']`. There is no `.dark` class.

## Accessibility baseline

Target (R-32): WCAG 2.2 AA. Keyboard access, visible focus, AA contrast, `prefers-reduced-motion`.

Target size: WCAG 2.2 SC 2.5.8 (Target Size, Minimum, Level AA) asks for 24 by 24 CSS px. The project rule is 44 by 44 px (R-32). Both apply: 24 px is the floor for conformance, 44 px is what we build to. Source for 2.5.8: <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>.

### What is in place

- Reduced motion: `globals.css` shortens animation and transition durations to 0.01 ms under `prefers-reduced-motion: reduce`.
- Visible focus on every `SN` component (`focusRing`: 2 px `--color-focus`, 2 px offset). The command palette is a Radix `Dialog` (focus trap, Escape closes) with `aria-label` and a screen-reader title. `Cmd+K` or `Ctrl+K` toggles it.
- The chat input has an `sr-only` label. The tab-like filter has `aria-label`.
- Icon buttons have `aria-label`.

### Contrast

The tokens are compro's, whose pairs were verified with the WCAG 2.1 formula (compro `tokens.md` 1.3 and 1.5). `packages/ui/src/__tests__/ui-tokens.test.ts` asserts every pair the app relies on in both themes (4.5:1 for text, 3:1 for non-text, including the input border and the focus ring). A new text-on-surface pair gets a line in that test. Pairs in the 13 product accent ramps are asserted there as well; the 7 proposed ramps still need the official contrast and color-vision review (OQ-UX-04).

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
