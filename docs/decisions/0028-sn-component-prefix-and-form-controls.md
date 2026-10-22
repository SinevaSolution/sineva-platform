---
title: "SN Component Prefix and Form Controls"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-22"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "design-system", "packages-ui", "naming", "select", "combobox"]
summary: "Every design-system component exported from @sineva/ui is named with the SN prefix (SNButton, SNSelect, ...), enforced by a test. Dropdown fields use SNSelect (Radix Select) and SNCombobox (Radix Popover plus cmdk) instead of a native select."
related_docs:
  - "README.md"
  - "../design-context/design_system.md"
  - "../project-structure/frontend_architecture.md"
adr_id: "0028"
decision_status: "accepted"
supersedes: []
---

# 0028 SN Component Prefix and Form Controls

Accepted on the Founder's instruction (two requirements given with WP-M0-39 and WP-M0-40).

## Context

Components in `@sineva/ui` and the app carried generic names (`Button`, `Card`, `Badge`, `Field`, `Tooltip`). They collide with names from Radix, Sonner, lucide and Next (`Link`, `Image`) in the same file, and a reader cannot tell a Sineva component from a library one. The app also used a native `<select>` for locale, time zone, salutation and department. A native select cannot be styled to the design, looks different per OS, and is unusable for a 400-entry time zone list.

## Decision

1. **Prefix.** Every component, and every type that belongs to one, exported from `@sineva/ui` (and from the app's shared `components/ui/`) starts with `SN`: `SNButton`, `SNButtonProps`, `SNSelect`, `SNSinoFigure`. Files are snake_case with the prefix as `sn_` (`sn_button.tsx`), one folder per component with `x.tsx`, `x.test.tsx`, `x.gallery.tsx`. Hooks, helpers and non-component values (`cx`, `focusRing`, `formatDate`, `snToast`) keep their normal names.
2. **Enforced.** `packages/ui/src/__tests__/naming.test.ts` fails when an export that starts with an uppercase letter does not start with `SN`, or a component folder is not `sn_*`.
3. **Scope.** The rule covers the design system. Feature components in `apps/web/src/client/components/<feature>/` (`ProfileForm`, `AppShell`) keep domain names.
4. **Dropdowns.** `SNSelect` (single choice, Radix Select) and `SNCombobox` (single choice with search, Radix Popover plus cmdk) are the only dropdown fields. A native `<select>` is not used in app code. Use `SNCombobox` above about 12 options or when people know the value by name (time zones, countries).
5. **Dependencies.** `@radix-ui/react-select` and `@radix-ui/react-popover`, pinned exactly (2.4.1 and 1.3.1), match the versions of the Radix packages already installed. `cmdk`, `vaul`, `sonner` and the other Radix packages were already dependencies.

## Consequences

- One rename touches every importer once; after that the prefix makes searches (`grep SNButton`) exact.
- Radix Select's trigger is a `button` with `role="combobox"` and a portal listbox, so it is not a form control the browser autofills. Its hidden native select keeps `name` and `required` working in a `<form>`.
- Radix Select forbids an empty string as an item value. `SNSelect` maps `''` to an internal sentinel so "not set" options still work.

## Alternatives considered

- **Keep generic names and rely on import paths**: collisions stay, and the Founder asked for the prefix.
- **Prefix only new components**: leaves two naming schemes in one package.
- **Native select styled with `appearance-none`**: cannot style the open list, no search.
- **A headless combobox library (Downshift, React Aria)**: a new dependency family when cmdk and Radix Popover cover the need.
