---
title: "AI-Native Design System Philosophy"
category: "design-context"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Design & Engineering"
tags: ["sineva", "design-system", "ui-ux", "accessibility", "wcag", "optimistic-ui"]
summary: "AI-Native UI philosophy for sineva-platform: visual hierarchy, progressive disclosure, optimistic UI, and WCAG AA accessibility standards."
related_docs:
  - "design_tokens.md"
  - "ux_and_frontend_libraries.md"
  - "copywriting_and_brand.md"
---

# AI-Native Design System Philosophy

`sineva-platform` is designed as a calm, high-precision **AI-Native Command Center** where operators collaborate with six specialized Sineva AI companions (`@SinoPeople`, `@SinoFinance`, `@SinoSales`, `@SinoSocial`, `@SinoHelp`, `@SinoInsights`). Every visual decision eliminates cognitive clutter and generic AI visual tropes in favor of editorial typography, tactile surfaces, and instant feedback.

---

## 1. Core UX Principles

### 1.1 Clear Visual Hierarchy (One Focal Point per Viewport)
- **Primary Zone**: Active AI Companion Workspace & Delegation Composer (`max-w-5xl`, generous padding, elevated surface contrast).
- **Secondary Zone**: Companion Roster Cards with live telemetry (`latency_p95_ms`, active status indicator, department badge, capability chips).
- **Tertiary Zone**: Infrastructure & BFF Gateway telemetry (`sineva_internal` bridge status, OpenAPI `/api-docs` shortcut, SeaweedFS S3 presign tester).

### 1.2 Progressive Disclosure
- Complex system details (e.g., raw `request_id` traces, token usage, MCP tool invocation arguments, or S3 presigned headers) are tucked neatly into collapsible metadata badges or secondary inspector drawers rather than overwhelming the primary conversation stream.
- The **`⌘K` Command Palette** (`cmdk`) gives power users immediate keyboard-driven navigation to any companion, department filter, or system action without cluttering the persistent navigation bar.

### 1.3 Optimistic UI & Streaming Responsiveness
- When a user dispatches a prompt to an AI companion (`POST /api/v1/agents/{agent_slug}/chat`), the user message is immediately rendered in the transcript via Redux (`append_optimistic_message`) while the companion displays a subtle pulse indicator (`--aqua-400` / `--teal-500`) until the structured response arrives.
- Every async surface implements all 4 states explicitly: **Idle**, **Loading (Skeleton/Shimmer)**, **Populated**, and **Actionable Error**.

---

## 2. WCAG 2.1 AA Accessibility Requirements

1. **Color Contrast**:
   - Body copy (`--color-text`) maintains a minimum **7.2:1** contrast ratio against `--color-canvas` and `--color-surface` in both Light and Dark themes.
   - Muted captions (`--color-text-muted`) maintain at least **4.6:1** contrast.
2. **Keyboard Navigation & Focus Rings**:
   - Every interactive control (`button`, `input`, companion card, `⌘K` item) displays a crisp `2px solid var(--color-action-primary)` focus-visible outline with `2px` offset.
   - Full keyboard support: `⌘K` / `Ctrl+K` toggles the command palette; `Escape` closes active modals; `Enter` submits prompts.
3. **Reduced Motion Respect**:
   - All CSS transitions and Motion/GSAP animations honor `@media (prefers-reduced-motion: reduce)` by collapsing transform durations to `0.01ms`.
