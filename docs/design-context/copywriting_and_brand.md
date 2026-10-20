---
title: "Copywriting & Brand Voice"
category: "design-context"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Brand & Product"
tags: ["sineva", "copywriting", "brand-voice", "companions", "sino", "microcopy"]
summary: "Sineva brand voice guidelines, specialized AI companion roster (@SinoPeople through @SinoInsights), and anti-slop UX microcopy rules."
related_docs:
  - "design_system.md"
  - "design_tokens.md"
---

# Copywriting & Brand Voice

Sineva's voice is **calm, articulate, evidence-first, and human-centric**. We avoid generic AI hype ("Unleash the magic of next-gen synergy!") in favor of clear operational language that respects the user's time.

---

## 1. The Six Specialized Sineva Companions (`@Sino*`)

Every companion in the Sineva ecosystem is addressed with an `@Sino*` handle, a kebab-case `agent_slug` in API URLs, and a well-defined operational mandate:

| Handle (`display_name`) | `agent_slug` | Department | Role Title & Domain Mandate |
| :--- | :--- | :--- | :--- |
| **`@SinoPeople`** | `sino-people` | `hr` | **People & Culture Partner** — Onboarding workflows, competency matrices, policy Q&A, and retention analytics. |
| **`@SinoFinance`** | `sino-finance` | `finance` | **FP&A & Treasury Strategist** — Burn-rate modeling, variance analysis, invoice reconciliation, and unit economics. |
| **`@SinoSales`** | `sino-sales` | `sales` | **Revenue & Deal Desk Architect** — Pipeline qualification, MEDDIC deal reviews, RFP drafting, and pricing tiers. |
| **`@SinoSocial`** | `sino-social` | `marketing` | **Brand & Editorial Strategist** — Multi-channel campaign calendars, technical product launches, and brand voice audits. |
| **`@SinoHelp`** | `sino-help` | `support` | **Customer Operations & SLA Lead** — Tier-2 incident triage, root-cause summaries, and knowledge base synthesis. |
| **`@SinoInsights`** | `sino-insights` | `analytics` | **Executive BI & Data Scientist** — Cohort retention SQL/vector synthesis, anomaly detection, and board deck briefs. |

---

## 2. Microcopy & Interface Text Standards

1. **Action Buttons (Verb + Specific Object)**:
   - Good: `"Dispatch to @SinoFinance"`, `"Register Companion"`, `"Generate S3 Presign Ticket"`
   - Avoid: `"Submit"`, `"Click Here"`, `"Go"`, `"Do Magic"`
2. **Empty States**:
   - Always explain *what* belongs in the view and provide a single one-click starter action (e.g., *"No conversation turns with @SinoPeople yet. Select a starter prompt below or press ⌘K to switch companions."*).
3. **Error Messages**:
   - State what happened, why, and the immediate remediation step (e.g., *"Could not reach internal AI Engine (`http://sineva-ai:8000`). Showing cached local simulation response; verify `sineva-ai` container health."*).
