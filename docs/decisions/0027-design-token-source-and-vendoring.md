---
title: "Design Token Source and Vendoring"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-22"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "design-tokens", "tailwind", "dark-mode", "packages-ui"]
summary: "The platform vendors the sineva-compro token CSS into packages/ui/src/styles, headed with the compro commit, and a checked-in snapshot plus a drift test fail CI when the copy and compro disagree. Compro wins any token conflict."
related_docs:
  - "README.md"
  - "../design-context/design_tokens.md"
  - "../design-context/design_system.md"
  - "../../docs/implementation-plan/M0-foundations.md"
adr_id: "0027"
decision_status: "accepted"
supersedes: []
---

# 0027 Design Token Source and Vendoring

Accepted on the Founder's delegation, using the implementation plan's recommended option (ADR-P-07).

## Context

The app used its own token set: same names as sineva-compro, different values (teal-700 `#0a6b5c` against `#00686D`), platform-only names (`--color-surface-elevated`, `--color-text-muted`), dark mode through `next-themes`, and `dark:` classes that followed the OS instead of `data-theme`. A visitor moving from the public site to the app saw two vendors. There is no shared build between the repos (ADR-0004 rejected a shared schema package for the same reason).

## Options considered

1. **Hand-copy values and keep both in sync by review**: drifts silently, which is what happened.
2. **Published `@sineva/design-tokens` package**: the right end state, but it needs a registry, versioning and a release step for one consumer. Revisit after beta (OQ-UX-01).
3. **Vendor the compro CSS into `packages/ui/src/styles/`, headed with the compro commit, guarded by a checked-in snapshot and a drift test**: no new infrastructure, drift fails CI, the update is a script run.

## Decision

1. **Compro is the source of truth.** `sineva-compro/docs/design/tokens.md` and its CSS win any token conflict. A value change lands in compro first, then here by the generator.
2. **Vendored files** in `packages/ui/src/styles/`: `tokens.css` (primitives in `:root`, semantic tokens in `@theme static`), `theme-dark.css` (semantic swaps only, under `:root[data-theme='dark']`), `product-accents.css` (compro ramps). Each carries a header with the compro commit. They are generated and never hand-edited.
3. **Generator** `packages/ui/scripts/sync_tokens.mjs <compro_path>` reads compro read-only, writes the three files and `tokens.snapshot.json` (the declared custom properties per file plus the compro commit).
4. **Drift test** (`packages/ui/src/__tests__/ui-tokens.test.ts`) compares the snapshot with the CSS actually vendored, light and dark, and re-asserts the WCAG contrast pairs. A hand edit of a vendored file fails it.
5. **Platform additions** live in two files. `app-density.css` only adds tokens compro does not define (app type scale, z-index scale, content widths, `--state-*`, warning, scrim, focus halo and the Room and auth scene tokens) and never redefines a compro token (a test fails if it does). `product-accents-proposed.css` holds the 7 proposed accent ramps; they are not in compro, so they cannot sit in the vendored `product-accents.css` without breaking the drift test. `globals.css` imports, in order: `tailwindcss`, tokens, dark, accents, proposed accents, app density.
6. **Theme mechanism**: `<html data-theme>` is set before first paint by the inline script ported from compro (`sineva-theme` key, first visit follows the OS). `next-themes` is removed. The script carries the CSP nonce.
7. **Tailwind**: `dark:` is not used anywhere; components use semantic tokens that swap under `data-theme`.

## Consequences

- Compro's radius scale, shadows, easing and type tokens override Tailwind's defaults in the app (`rounded-xl` is 28 px). Layouts keep their look by using the token that matches the approved size.
- Updating tokens is: pull compro, run the generator, review the diff, run the tests.
- The compro commit in the header can point at a branch that is not yet merged in compro. Re-sync once compro's token commit lands on its main branch.
- The 7 proposed ramps (`desk` to `ops`) are not in compro. They are marked proposed and wait for the official contrast and color-vision test (OQ-UX-04, M4).

## Alternatives considered

See Options considered. A Git submodule of compro was rejected: it makes every platform checkout depend on a second private repo.
