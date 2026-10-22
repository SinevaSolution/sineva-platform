---
title: "ADR-0045: Workflow definition, versions, lints and templates as data"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "workflows", "validation", "versions"]
summary: "A Workflow is one JSON definition (schema_version 1) validated by a pure TypeScript validator shared by the server and the builder. Published versions are immutable, publish needs a test run on the current draft, and templates T1 to T5 are code data, not a table."
related_docs:
  - "0046-workflow-run-contract-v2-1-platform-side.md"
  - "0024-specialist-manifest-and-catalog-split.md"
  - "0033-library-collections-access-and-plain-language.md"
adr_id: "0045"
decision_status: "Accepted"
supersedes: []
---

# ADR-0045: Workflow definition, versions, lints and templates as data

## Status

Accepted (2026-10-23). Founder delegated: the plan's recommended options are used. The sineva-ai twin (its own validator over the same fixtures) is blocked: needs sineva-ai team.

## Context

PRD 10 and WP-M3-05 and WP-M3-08 ask for one definition format, a validator and lints that block publishing, immutable versions, and five seeded templates. The plan puts the validator in a `packages/workflow-schema` package and templates in a `workflow_templates` table. The builder needs the same validator in the browser for inline messages, and the repo's specialists already live as code data (ADR-0024), not rows.

## Decision

1. **Format.** `schema_version: 1`, `inputs` (text, number, date, library_file, choice), `steps` (at most 12 counted including loop bodies), `outputs`, `limits`. Step types: `specialist_task`, `skill` (reserved), `connection_action`, `review`, `condition`, `wait`, `loop`, `ask_me`, `squad_task` (reserved). A loop owns a `body` list that cannot hold a loop. A condition is "continue only if": when it is false the run ends with an optional note in the Inbox. There are no branches to merge and no parallel steps (OQ-WF-3 default).
2. **Values reach a step only through `{{inputs.<key>}}`, `{{steps.<key>.output}}` and, inside a loop body, `{{loop.item}}`.** Any other `{{...}}` is invalid, and so is a reference to a missing or later step, so secrets and tokens can never be variables (FR-WF-16).
3. **Validator.** A pure function in `src/shared/workflows/validate.ts`, with no `server-only` code, run by the use cases (publish, run, edit) and by the builder. Output is a list of typed issues (`code`, `path`, `step_key`, `params`) mapped to message keys `workflows.issues.<code>` in both locales. A `pay`-class action, a nested loop, 13 steps, a wait over 7 days, a loop cap over 25 for a non-admin, a reserved step type, a missing or later reference are errors. Lints that block publish: a write or send step with no earlier Review step when the chain holds private data, untrusted content and a send (lethal trifecta); a specialist that is not enabled or a connection that is not connected ("Needs attention"). A generated definition (flag `generated`) also must add no send or pay step unasked and put a Review before every write (FR-WF-19).
4. **Shared fixtures.** `src/__tests__/workflows/fixtures/*.json` hold valid and invalid definitions with the issue codes the validator must return. sineva-ai runs its Python validator over copies of the same files.
5. **Versions.** `workflows` holds the draft (`draft_definition`, `draft_revision`). Every edit bumps `draft_revision`; a stale `expected_revision` is a 409 `draft_conflict`. Publish writes an immutable `workflow_versions` row with the next number and a note. Restore republishes an old definition as a new number. A workflow with runs is archived, never deleted.
6. **Publish gate.** Publish needs a valid draft and one succeeded test run whose `draft_revision` equals the current one. An edit invalidates it.
7. **Permissions.** `workflow.read|create|edit|publish|run|review|delete|trace.view`. Members edit only drafts they created. Publish, restore, archive, delete and raising the loop cap are Owner and Admin (OQ-WF-4 default).
8. **Templates are code data** (`src/shared/workflows/templates.ts`, both languages, `required_specialists`, `required_connections`, `wave`), like the specialist manifest. The plan's `workflow_templates` table is not created: nothing edits a template at runtime, a seed would need a reviewed data migration for every wording fix (the same trap as specialist slugs), and "use" copies the definition into a draft anyway. If customer-authored templates appear later they get their own table then.
9. **Connection actions** are picked from a `ConnectorActionRegistry` port (connection, action id, class `read|write|send|pay`, whether it reads private data or external content). The connector and Tool Gateway work (M2) does not exist on this base, so the adapter reports no connections. The builder then says what is missing; nothing is faked.
10. **Library access.** The `workflow` Library scope is accepted: `scope_ref` is a workflow id of the same workspace, the principal is `workflow:<id>`, and a member limited to some specialists still does not see documents scoped only to a workflow.

## Consequences

- The builder, the API and the lints cannot drift: one function.
- The Python validator must reproduce the issue codes on the fixtures. Until sineva-ai ships it, only the platform validates; run start re-validates anyway.
- Without a connector registry no connection-action step can be completed, so the five templates open with those steps marked "Needs attention".
- Changing a limit is a constant plus fixtures, never a migration.

## Alternatives considered

- **`packages/workflow-schema` workspace package.** Needs alias plumbing in four configs and an install step for no extra reuse; the folder under `src/shared` is already imported by both sides and can be moved later.
- **`workflow_templates` table with seeds.** See point 8.
- **Branches in conditions (If yes and If no blocks).** More builder surface and a merge rule nobody can explain; the plan's linear form covers T1 to T5.
