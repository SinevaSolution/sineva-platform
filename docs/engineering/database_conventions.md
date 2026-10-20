---
title: "Database & Drizzle ORM Conventions"
category: "engineering"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "postgresql", "drizzle-orm", "database", "snake-case", "schema", "migrations"]
summary: "PostgreSQL 17 and Drizzle ORM conventions for sineva-platform, including strict snake_case table/column naming, shared database coexistence with sineva-ai, and indexing rules."
related_docs:
  - "coding_standards.md"
  - "design_pattern.md"
  - "../deployment/docker_compose_topology.md"
---

# Database & Drizzle ORM Conventions

`sineva-platform` uses **PostgreSQL 17** (`postgres:17-alpine`) as its primary relational store, accessed via **Drizzle ORM** in `apps/web/src/infrastructure/database/`.

---

## 1. Shared Database Coexistence (`sineva_platform`)

Both `sineva-platform` (Drizzle ORM) and `sineva-ai` (SQLAlchemy 2.0 Async) connect to the shared PostgreSQL database (`POSTGRES_DB=sineva_platform`). To ensure clean coexistence and zero schema collisions:
1. **Strict `snake_case` Identifiers**: All table names, column names, enum names, foreign keys, and index names MUST be lowercase `snake_case`.
2. **Table Ownership**:
   - Platform-managed tables: `workspaces`, `users`, `ai_agents`, `storage_objects`.
   - AI Engine-managed tables: `agent_conversations`, `agent_messages`, `workflow_executions`, `mcp_audit_logs`.
3. **Timestamps & Primary Keys**:
   - Every table includes `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`) and `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`).
   - Primary keys are named `<singular_entity>_id` (e.g., `agent_id`, `workspace_id`, `conversation_id`) rather than ambiguous `id` columns.

---

## 2. Drizzle Schema Definition Standards

When defining tables in `apps/web/src/infrastructure/database/schema.ts`, keep the TypeScript property keys in Drizzle table definitions identical to the underlying PostgreSQL `snake_case` column names:

```typescript
import { pgTable, varchar, text, boolean, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const aiAgentsTable = pgTable(
  'ai_agents',
  {
    agent_id: varchar('agent_id', { length: 64 }).primaryKey(),
    agent_slug: varchar('agent_slug', { length: 64 }).notNull().unique(),
    display_name: varchar('display_name', { length: 120 }).notNull(),
    department: varchar('department', { length: 64 }).notNull(),
    role_title: varchar('role_title', { length: 160 }).notNull(),
    description: text('description').notNull(),
    avatar_accent_token: varchar('avatar_accent_token', { length: 64 }).notNull(),
    default_model: varchar('default_model', { length: 80 }).notNull(),
    capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
    is_active: boolean('is_active').notNull().default(true),
    latency_p95_ms: integer('latency_p95_ms').notNull().default(420),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_agents_department').on(table.department),
    index('idx_ai_agents_is_active').on(table.is_active),
  ],
);
```

---

## 3. Indexing & Query Performance Rules

1. **Index Naming Convention**:
   - Standard B-Tree index: `idx_<table>_<column_1>_<column_2>`
   - Unique constraint/index: `uq_<table>_<column>`
   - Foreign key constraint: `fk_<table>_<ref_table>`
2. **Always Paginate Collection Queries**:
   - Every list query must accept `page` and `per_page` (capped at `100`) and return both the slice of rows (`LIMIT` / `OFFSET`) and `total_items` so `createPaginatedResponse` can populate `PaginationMeta`.
3. **Connection Pooling**:
   - Use a singleton connection pool in `apps/web/src/infrastructure/database/client.ts` guarded against Next.js hot-module replacement (`globalThis.__sinevaPgPool`) in development.
