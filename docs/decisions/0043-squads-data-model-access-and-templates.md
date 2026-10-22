---
title: "ADR-0043: Squads data model, access, permissions and templates"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "squads", "access", "permissions", "library"]
summary: "A squad is a workspace row with 2 to 5 member specialists, a goal and a lead. Its chats are conversations with kind squad. Opening one needs access to every member, unless an Owner or Admin granted an override. Templates are code, like the specialist manifest. The Library accepts the squad scope."
related_docs:
  - "0024-specialist-manifest-and-catalog-split.md"
  - "0033-library-collections-access-and-plain-language.md"
  - "0044-squad-chat-relay-signed-context-and-turn-bounds.md"
adr_id: "0043"
decision_status: "Accepted"
supersedes: []
---

# ADR-0043: Squads data model, access, permissions and templates

## Status

Accepted (2026-10-23). Founder delegated: the Founder asked for the platform half of Squads (WP-M4-05, 07, 10 and the Library scope) to proceed with the plan's defaults. Defaults taken are marked "default, unconfirmed" and listed at the end.

## Context

The Squads PRD (FR-SQD-01 to 06, 18, 26) and decisions D-M4-1, D-M4-3, D-M4-12 and D-M4-14 fix the behaviour. The repo already has `conversations` with a free-text `kind`, a reserved `squad` Library scope (ADR-0033), the `squads.enabled` entitlement key and a specialist roster read from sineva-ai (ADR-0024). It has no connections module, no usage ledger and no workflow or routine domain yet.

## Decision

1. **Tables** (schema `platform`, additive): `squads` (name, goal up to 500, `lead_type` `sino` or `member`, `lead_agent_slug`, `template_slug`, `status` `active` or `archived`, `limits` json, creator), `squad_members` (unique `squad_id, agent_slug`, `position`), `squad_access_overrides` (unique `squad_id, user_id`), and `conversations.squad_id` (nullable, cascade). `kind = squad` needs no backfill: `kind` is already text and every existing row stays `hub` or `room` (D-M4-1; no second session table).
2. **Needs attention is computed, not stored.** The PRD lists it as a status value, but it depends on live facts (a member disabled in the workspace, a lead no longer a member, a required connection gone). A stored value would be stale the moment the roster changes. The API returns `status` (`active` or `archived`) and `attention` (a list of `{reason, agent_slug?}`); the screen derives the state. When the roster cannot be read (sineva-ai down) `attention_checked` is false and the screen says it could not check, it does not claim all is well.
3. **Composition rules** (domain, pure): 2 to 5 distinct members; each enabled in the workspace and accessible to the person saving; no squad inside a squad (a member is a specialist slug, never a squad id); the lead is `sino` or one of the members; goal required. Archived squads are read-only. A specialist can be in several squads.
4. **Access (FR-SQD-18, D-M4-12).** A person opens a squad when they can access every member (their specialist scope). Otherwise the squad reads "Ask an admin for access". Owner and Admin can grant a per-person override (`PUT .../squads/{id}/access`, permission `squad.access.override`, audit `squad.access_overridden`) with the warning that output of restricted specialists becomes visible. The override is stored per person, so it is explicit and revocable.
5. **Permissions.** Seven keys, default roles from the PRD: `squad.read` (all four), `squad.create` and `squad.chat` (owner, admin, member), `squad.edit` (owner, admin; member only for squads they created, `limited`), `squad.memory.edit` (owner, admin, member), `squad.access.override` and `squad.delete` (owner, admin). Viewer reads but cannot chat. Squad id from another workspace answers 404.
6. **Entitlements.** Creating a squad checks `squads.enabled` and `squads.max` (quantity = squads after the create, D-M4-3). `open` mode ignores both.
7. **Templates are code** (`src/shared/squads/templates.ts`, like the specialist manifest of ADR-0024), not the `squad_templates` table of the PRD. Reason: the copy must exist in Indonesian and English and pass the copy lint, which the manifest pattern already does; a table would duplicate it and need a seed in the shared database that the integrator would have to run. Each template carries `target_members` (the full roster, for later) and `starter_members` (what exists today). Only starter members are ever returned, so an unreleased specialist is never listed, not even disabled (FR-SQD-03). Launch, Back-office and Customer ship with three starter prompts and suggested Library folders each.
8. **Routes** (`/api/v1/workspaces/{workspace_id}/...`, D-M0-1): `GET/POST squads`, `GET/PATCH/DELETE squads/{id}`, `PUT squads/{id}/members`, `PUT squads/{id}/access`, `GET squad-templates`, `POST squad-templates/{slug}/use`, plus the session routes of ADR-0044. `PATCH` with `status: archived` archives; `DELETE` removes the squad and its sessions.
9. **Audit.** `squad.created`, `squad.updated`, `squad.member_added`, `squad.member_removed`, `squad.lead_changed`, `squad.archived`, `squad.deleted`, `squad.access_overridden`, each in the transaction of the change, with ids and counts only (never the goal text). `squad.turn.limit_reached` is written by the relay (ADR-0044). `squad.memory.updated` belongs to the memory work and is not emitted here.
10. **Library scope.** The Library accepts `{scope_type: "squad", scope_ref: <squad id>}` and verifies the squad exists in the workspace. The access picker lists active squads. Visibility rule kept conservative: a member limited to selected specialists never sees squad-scoped files (the existing rule); Owner, Admin and unrestricted members do. Changing a scope re-labels, it does not re-read (ADR-0033).
11. **Tools.** A member's effective tools are its allowlist, intersected with what the person may do and with the connections they can use (PRD security notes). The platform has no connections module yet, so a typed port (`MemberToolPolicy`) returns the allowed tool names per member and the shipped adapter returns none. The claim therefore never carries a tool the person lacks; real intersection plugs in with the connections work without changing callers.
12. **Reserved hooks for Workflows and Routines** (WP-M4-10): domain types and a validator for the "Squad task" step and routine target (`squad_automation.ts`): a nested squad is rejected, an archived squad reads Needs attention, the run identity is the invoking identity, never the creator. No engine is built here; the Workflow and Routine domains do not exist yet.

## Defaults taken (default, unconfirmed)

- Starter bounds (4 delegations, 2 parallel, 90 s, 60 000 tokens, 40 points) are configuration starting values, not measured p95 (D-M4-11).
- `squads.max` is added to the entitlement keys with no value in `open` (D-M4-3).
- The squad stays behind `squads.enabled` (D-M4-14).
- Activity (ADR-0044) shows a person their own turns; Owner and Admin see all turns of the squad. Turn rows hold no message text.

## Consequences

- One migration set adds the tables and the nullable column; existing rows are untouched.
- Templates change with a deploy, not with a database edit.
- Per-person access overrides add one lookup to opening a squad.

## Related

[ADR-0044](0044-squad-chat-relay-signed-context-and-turn-bounds.md) (chat, claim and bounds), [ADR-0024](0024-specialist-manifest-and-catalog-split.md), [ADR-0033](0033-library-collections-access-and-plain-language.md).
