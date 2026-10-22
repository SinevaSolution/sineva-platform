---
title: "Design Context"
category: "design-context"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "design", "ui", "index", "accessibility"]
summary: "Index of the front-end design docs: how the UI is built and where it falls short, the design tokens in globals.css, the installed libraries, and the voice for microcopy."
related_docs:
  - "design_system.md"
  - "design_tokens.md"
  - "ux_and_frontend_libraries.md"
  - "copywriting_and_brand.md"
  - "../README.md"
---

# Design context

This folder describes the web UI as it is built in `apps/web` and `packages/ui`: layout and components, accessibility, the CSS tokens, the installed front-end libraries, and the voice for interface text. It also records where the code does not meet the rules. It does not hold the product roster and guardrails ([product](../product/README.md)), client state and folder rules ([project-structure](../project-structure/frontend_architecture.md), [state management](../engineering/state_management_redux.md)), or Figma files.

"Current" is what the code does. "Target" is decided but not built.

| File | What it covers | Read it when |
| :--- | :--- | :--- |
| [design_system.md](design_system.md) | Components in `@sineva/ui`, theming, the WCAG 2.2 AA baseline with measured contrast, page states, current deviations | You build or review UI |
| [design_tokens.md](design_tokens.md) | The vendored sineva-compro token set, the app-density layer, the `data-theme` mechanism, z-index, fonts, how to add a token | You add a color, a theme rule, or a dark-mode style |
| [ux_and_frontend_libraries.md](ux_and_frontend_libraries.md) | Which packages are installed and which are used, motion, the command palette, toasts, UX patterns still to build | You pick a library or add an interaction |
| [copywriting_and_brand.md](copywriting_and_brand.md) | Voice, microcopy patterns, error copy for 404, 422, 500, 502 and 503 | You write a button, an empty state or an error message |

## Reading order

1. [design_system.md](design_system.md).
2. [design_tokens.md](design_tokens.md).
3. [ux_and_frontend_libraries.md](ux_and_frontend_libraries.md).
4. [copywriting_and_brand.md](copywriting_and_brand.md), together with [product model and wording](../product/product_model_and_wording.md).

## Related

- Rules: R-30 (semantic tokens), R-31 (loading, error, not-found), R-32 (WCAG 2.2 AA), R-33 to R-36 (wording). See [agent rules](../governance/agent_rules.md).
- Decisions: [ADR-0004](../decisions/0004-web-app-structure-and-dependency-rules.md), [ADR-0010](../decisions/0010-one-chat-with-mentions.md), [ADR-0011](../decisions/0011-user-facing-wording.md).
- UI debt with fixes: [known issues and tech debt](../development/known_issues_and_tech_debt.md).
