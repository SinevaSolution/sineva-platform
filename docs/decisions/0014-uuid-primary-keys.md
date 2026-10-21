---
title: "ADR-0014: UUID primary keys"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "database", "uuid", "primary-key", "cross-service"]
summary: "Every table in the platform uses a database-generated UUID primary key named id, and sineva-ai also uses UUID keys, so no service mints prefixed string ids."
related_docs:
  - "0005-prisma-replaces-drizzle.md"
  - "0006-shared-postgres-platform-schema.md"
  - "0015-sineva-ai-owns-internal-chat-contract.md"
  - "../engineering/database_conventions.md"
  - "../governance/agent_rules.md"
adr_id: "0014"
decision_status: "Accepted"
supersedes: []
---

# ADR-0014: UUID primary keys

## Status

Accepted (2026-10-21).

Cross-service: mirrored in sineva-ai `docs/decisions/` (a sineva-ai ADR of the same title; that folder does not exist yet, so no number is cited). Change both repos together.

## Context

The first scaffold identified rows with prefixed strings. Traces remain: the dashboard still sends `user_id: 'usr_executive_01'`, and the sample request in the contract fixtures uses `usr_01J9ZQ4K7M` and `tnt_sineva_demo`. Prefixed strings are chosen by whoever writes the code, so two writers can collide, and nothing in the database type says what shape an id has.

`sineva-ai` already moved its keys and its wire ids to UUIDs: its chat DTOs type `message_id`, `session_id` and the citation `document_id` as `UUID`, and a `session_id` in a request must be a UUID. The platform has to agree with that, or the two services keep translating between id formats.

## Decision

- Every platform table has a primary key `id` of type `UUID` with the database default `gen_random_uuid()`. In `apps/web/prisma/schema.prisma` that is `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`. Foreign key columns are `@db.Uuid` as well.
- The value is UUID v4. Postgres 17 has no native `uuidv7()`, and an extension or application-side generator is not worth adding for this.
- No prefixed string ids (`usr_...`, `agt_...`) and no ids generated in application code. The database assigns the id on insert.
- `sineva-ai` uses UUID keys with the same `gen_random_uuid()` default in its Alembic migration. Its column names differ: the key is named after the entity (`session_id`, `agent_id`, `message_id`, `document_id`, `workflow_execution_id`), not `id`. Only the type and the default are shared.
- `sineva-ai` seeds its agent ids deterministically as `uuid5(SINEVA_AGENT_NAMESPACE, slug)` in `agentic/agents/specialists.py`, so they survive restarts. The platform seed leaves ids to the database default.

## Consequences

- One id type on the wire and in both schemas. `session_id` from `sineva-ai` can be stored as a platform UUID column without conversion.
- Ids are not shared between services for the same product. The platform `agent_configs.id` and the `sineva-ai` `ai_agents.agent_id` for `sinofinance` are different values. The slug is the cross-service key ([ADR-0012](0012-canonical-product-slugs-and-guardrails.md)). This is part of the duplicate companion registry debt.
- Random v4 keys insert at random positions in the primary key index, which costs some locality compared with sequential keys. Inference, not measured here; at the current table sizes it is not a concern. Revisit with uuidv7 if Postgres gains it.
- The wire field `user_id` is still an opaque string. The platform chat request accepts 3 to 128 characters and `sineva-ai` accepts 1 to 128, so a UUID fits, but nothing enforces it. Once authentication exists, the platform sends `users.id`. Until then the hardcoded `usr_executive_01` is known debt ([ADR-0015](0015-sineva-ai-owns-internal-chat-contract.md)).
- There is one committed migration, `20261021013412_init`, and it creates every table with the UUID default.

## Alternatives considered

- Keep prefixed string ids. Rejected: collision-prone, unvalidated, and different from `sineva-ai`.
- Auto-increment integers. Rejected: ids from two services in one database would overlap in meaning, and the wire already carries UUIDs from `sineva-ai`.
- UUID v7 or ULID generated in the application. Rejected for now: needs application-side generation (against "the database assigns the id") or an extension, for a locality gain nobody has measured.
