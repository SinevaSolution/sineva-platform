---
title: "UX Patterns & Frontend Libraries"
category: "design-context"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Design & Engineering"
tags: ["sineva", "radix-ui", "shadcn", "cva", "tailwind-v4", "motion", "gsap", "cmdk", "sonner", "lucide"]
summary: "Frontend stack and interaction specifications: Radix UI / shadcn primitives, CVA, Tailwind CSS v4, Motion/GSAP exponential easing, cmdk command palette, sonner toasts, next-themes, and Lucide icons."
related_docs:
  - "design_system.md"
  - "design_tokens.md"
  - "../engineering/state_management_redux.md"
---

# UX Patterns & Frontend Libraries

`sineva-platform` integrates a curated set of accessible, high-performance UI and motion libraries inside `apps/web` and `packages/ui`.

---

## 1. Frontend Library Matrix

| Capability | Library / Package | Usage in `sineva-platform` |
| :--- | :--- | :--- |
| **Styling & Tokens** | **Tailwind CSS v4** (`@tailwindcss/postcss`) | Utility-first layout bound to CSS custom properties in `globals.css`. |
| **Component Variants** | **`class-variance-authority` (CVA)** + `clsx` + `tailwind-merge` | Type-safe component variants (`intent`, `size`, `surface`) in `@sineva/ui` and `apps/web`. |
| **Accessible Primitives** | **Radix UI** (`@radix-ui/react-dialog`, `@radix-ui/react-slot`) | WAI-ARIA compliant modal dialogs, popovers, and polymorphic slots. |
| **Command Palette (`⌘K`)** | **`cmdk`** | Instant keyboard command bar for switching AI companions, filtering departments, or jumping to `/api-docs`. |
| **Toast Notifications** | **`sonner`** | Non-blocking toast feedback when agents are created, prompts complete, or S3 presigned URLs are generated. |
| **Theme Orchestration** | **`next-themes`** | Zero-flash Light / Dark theme switching synchronized with semantic CSS tokens. |
| **Motion & Choreography** | **`motion` (Framer Motion)** & **GSAP** | Exponential ease-out (`cubic-bezier(0.22, 1, 0.36, 1)`) card entrances, layout transitions, and streaming pulses. |
| **Iconography** | **`lucide-react`** | Consistent `1.75px` stroke vector icons across companion cards and action bars. |

---

## 2. Motion & Easing Standards

All animations use natural, high-damping exponential easing curves—never linear or bouncy spring defaults:
- **Standard CSS Curve**: `cubic-bezier(0.22, 1, 0.36, 1)` (`duration: 220ms`)
- **Micro-interaction Hover**: `150ms` opacity/border/transform transition.
- **Command Palette & Modal Entrance**: `scale(0.97) -> scale(1.0)` with opacity fade over `180ms`.

---

## 3. `⌘K` Command Palette (`cmdk`) Workflow

Pressing `⌘K` (macOS) or `Ctrl+K` (Windows/Linux) anywhere in the workspace opens the global command palette:
1. **Companion Quick-Switch**: Jump directly to `@SinoPeople`, `@SinoFinance`, `@SinoSales`, `@SinoSocial`, `@SinoHelp`, or `@SinoInsights`.
2. **Department Filter**: Filter the workspace roster by `hr`, `finance`, `sales`, `marketing`, `support`, or `analytics`.
3. **Developer & Gateway Tools**: Open `/api-docs` (Swagger UI), inspect `/api/v1/health`, or generate a test SeaweedFS S3 presigned upload ticket.
