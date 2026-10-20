---
title: "ADR-003: Agentic UX Patterns, Command Palettes & Streaming"
category: "research"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Design & Product Research"
tags: ["sineva", "research", "ux", "agentic-ui", "cmdk", "optimistic-ui"]
summary: "UX research findings on multi-agent delegation interfaces, keyboard-first command palettes (⌘K), and transparent tool execution telemetry."
related_docs:
  - "../design-context/design_system.md"
  - "../design-context/ux_and_frontend_libraries.md"
---

# ADR-003: Agentic UX Patterns, Command Palettes & Streaming

## Status
**Accepted** (2026-10-21)

---

## 1. Beyond the Single-Thread Chatbot

Generic AI interfaces trap users in a single blank text box where one undifferentiated model attempts every task. Our UX research for Sineva identified three critical failure modes of single-thread chat:
1. **Context Pollution**: Mixing HR policy drafts (`@SinoPeople`) with Q3 financial modeling (`@SinoFinance`) degrades both prompt accuracy and human mental models.
2. **Opaque Latency**: When an agent takes 400–1200ms to query Qdrant and execute an MCP tool, a static spinner erodes user trust.
3. **Slow Navigation**: Clicking through nested sidebar trees to switch domain contexts interrupts keyboard flow.

---

## 2. Sineva's Three Agentic UX Patterns

### 2.1 Specialized Companion Scopes (`@Sino*`)
Each companion (`@SinoPeople`, `@SinoFinance`, `@SinoSales`, `@SinoSocial`, `@SinoHelp`, `@SinoInsights`) maintains its own dedicated conversation thread (`chat_history_by_agent[agent_slug]`), domain capability chips, and curated starter prompts.

### 2.2 Keyboard-First Delegation via `⌘K` (`cmdk`)
Users can switch companions, filter by department, or trigger infrastructure actions in `< 150ms` using `⌘K` without leaving the keyboard.

### 2.3 Transparent Telemetry Badges
Every companion response surfaces:
- **`delegated_tools`**: Which internal tools or RAG indexes were consulted (e.g., `financial_ledger_query`, `qdrant_knowledge_search`).
- **`execution_source` & `latency_ms`**: Exact round-trip execution latency in tabular monospace typography (`Geist Mono`).
- **`request_id`**: End-to-end trace ID matching the `ApiResponse<T>` envelope.
