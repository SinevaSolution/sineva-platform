---
title: 'Architecture Decision Records'
category: 'decisions'
status: 'active'
version: '1.3.0'
last_updated: '2026-10-22'
owner: 'Sineva Engineering'
tags: ['sineva', 'adr', 'decisions', 'index']
summary: 'Index of the decisions that shape sineva-platform, with the format and rules for adding or superseding one.'
related_docs:
  - '../README.md'
  - '../governance/README.md'
  - '../governance/agent_rules.md'
adr_id: 'index'
decision_status: 'n/a'
supersedes: []
---

# Architecture Decision Records

An ADR records one decision: what was chosen, why, and what it costs. All 29 are Accepted. This folder holds decisions only. How-to guides, current-state descriptions and the rules derived from the decisions live elsewhere ([agent rules](../governance/agent_rules.md), [engineering](../engineering/README.md)). When a rule and its ADR disagree, the ADR wins and the rule gets fixed.

Items marked "cross-service" are mirrored in `sineva-ai` (`docs/decisions/` there, a sineva-ai ADR of the same title). Change both repos together.

| File                                                         | What it covers                                                                                                                                    | Read it when                                                                     |
| :----------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------- |
| [0001](0001-bff-gateway.md)                                  | The platform is the only public entry point; `sineva-ai` stays internal                                                                           | You add a route or expose a port                                                 |
| [0002](0002-seaweedfs-presigned-uploads.md)                  | SeaweedFS S3, browser uploads through presigned URLs                                                                                              | You touch uploads or storage                                                     |
| [0003](0003-snake-case-wire-contract.md)                     | `snake_case` keys and the shared response envelope (cross-service)                                                                                | You add or change an endpoint or a column                                        |
| [0004](0004-web-app-structure-and-dependency-rules.md)       | `app`, `server`, `client`, `shared` and the import rules                                                                                          | You decide where code goes                                                       |
| [0005](0005-prisma-replaces-drizzle.md)                      | Prisma 7.10.1, pinned exactly; the `_prisma_migrations` gotcha                                                                                    | You install a package or run Prisma                                              |
| [0006](0006-shared-postgres-platform-schema.md)              | Schemas `platform` and `sineva_ai` in one database (cross-service)                                                                                | You run a migration or a destructive command                                     |
| [0007](0007-tdd-fakes-integration-containers.md)             | TDD, fakes, throwaway Postgres, contract tests                                                                                                    | You write or run tests                                                           |
| [0008](0008-no-silent-fallbacks.md)                          | No empty catch, no fabricated data; remaining debt (cross-service)                                                                                | You write an adapter or a health check                                           |
| [0009](0009-conventional-commits-and-pr-template.md)         | Conventional Commits and the PR template                                                                                                          | You commit or open a PR                                                          |
| [0010](0010-one-chat-with-mentions.md)                       | One chat with Sino, products called by @mention (cross-service)                                                                                   | You design chat UX or routing                                                    |
| [0011](0011-user-facing-wording.md)                          | Companion wording; "agent" stays in code (cross-service)                                                                                          | You write copy                                                                   |
| [0012](0012-canonical-product-slugs-and-guardrails.md)       | Canonical slugs, the `sino` orchestrator, guardrails (cross-service)                                                                              | You touch slugs, seed data or product behavior                                   |
| [0013](0013-internal-service-auth-header.md)                 | `X-Internal-Api-Key` and the shared secret (cross-service)                                                                                        | You touch service auth or compose env                                            |
| [0014](0014-uuid-primary-keys.md)                            | UUID primary keys, `gen_random_uuid()` (cross-service)                                                                                            | You add a table or an id field                                                   |
| [0015](0015-sineva-ai-owns-internal-chat-contract.md)        | `sineva-ai` owns the chat contract; fixtures copied byte for byte (cross-service)                                                                 | You change the chat request or reply                                             |
| [0016](0016-upstream-failures-return-502-503.md)             | Bad upstream answer is 502, unreachable upstream is 503 (cross-service)                                                                           | You handle a `sineva-ai` failure                                                 |
| [0017](0017-authentication-mechanism.md)                     | Better Auth on platform schema, 14-day sliding sessions, password policy                                                                          | You touch auth or user registration                                              |
| [0018](0018-workspace-tenancy-and-public-contract.md)        | Workspace tenancy, path-based routing, no identity in request bodies                                                                              | You add or modify tenant-scoped routes                                           |
| [0019](0019-role-and-permission-model.md)                    | Four static roles, permission registry, specialist scoping                                                                                        | You add or check route permissions                                               |
| [0020](0020-multi-tenancy-isolation-and-lifecycle.md)        | Seven isolation layers, seven workspace lifecycle states                                                                                          | You implement tenancy, isolation or limits                                       |
| [0021](0021-signed-internal-context.md)                      | EdDSA compact JWS internal context token (cross-service)                                                                                          | You call or verify sineva-ai internal requests                                   |
| [0022](0022-run-handle-and-sse-relay.md)                     | Run handle, `chat_runs`, SSE relay with resume and cancel (cross-service)                                                                         | You touch streaming, run ids or the stream routes                                |
| [0023](0023-locale-preference-and-i18n-architecture.md)      | Locale from profile, cookie, Accept-Language; one registry; catalogs; copy lint                                                                   | You add or change user-facing text or a language                                 |
| [0024](0024-specialist-manifest-and-catalog-split.md)        | Specialist manifest in code owns display copy, sineva-ai owns availability, `agent_configs` dropped                                               | You touch the specialist roster, the shell's specialists or the agents route     |
| [0025](0025-card-schema-registry.md)                         | Card schema registry, validation, `message_cards`, fallback renderer (cross-service)                                                              | You add a card type or touch card validation                                     |
| [0026](0026-profile-preferences-and-avatar-pipeline.md)      | `/me` profile resource, `user_preferences` table, presigned avatar upload re-encoded with sharp                                                   | You touch profile fields, preferences or avatars                                 |
| [0027](0027-design-token-source-and-vendoring.md)            | Compro tokens vendored into `packages/ui/src/styles`, snapshot plus drift test, compro wins                                                       | You touch colors, type, radius, shadows, z-index or theme                        |
| [0028](0028-sn-component-prefix-and-form-controls.md)        | Every design-system component starts with `SN`; dropdown fields are `SNSelect` and `SNCombobox`, never a native select                            | You add or rename a shared component, or need a dropdown                         |
| [0029](0029-members-invitations-and-ownership-transfer.md)   | Invitation token hashing and binding, 7-day expiry, role limits, ownership transfer by target confirmation                                        | You touch members, invitations, roles or ownership                               |
| [0030](0030-library-ownership-split-and-ingest-contract.md)  | Library: platform owns metadata, scopes, quotas and retrieval scope; sineva-ai owns parsing and vectors; proposed ingest contract (cross-service) | You touch the Library, uploads of documents or the knowledge calls to sineva-ai  |
| [0031](0031-business-profile-onboarding-and-website-scan.md) | First workspace endpoint, onboarding state, versioned Business Profile, profile pack, website scan port (cross-service, proposed contract)        | You touch onboarding, the Business Profile, the profile pack or the website scan |

| [0032](0032-inbox-items-approvals-and-run-resume.md) | Inbox items, approvals, revisions, input requests; claim then resume then commit decisions (cross-service, proposed upstream contract) | You touch the Inbox, approvals, input requests or run resume |
| [0034](0034-inbox-triage-views-and-updates-tab.md) | Inbox views Needs you, Updates and Done; results move to Updates; kind, source and text filters; chat link by conversation id | You touch the Inbox tabs, filters or counts |

| [0033](0033-library-collections-access-and-plain-language.md) | Library collections carry 'Who can use this', documents inherit or override, Squad and Workflow scopes reserved, retrieval scope equals access, plain-language statuses and banned technical words | You touch Library access, the Library page or the technical-word copy rule |

## Suggested reading order

1. 0001, 0004: what the system is and how the app is laid out.
2. 0003, 0014, 0015: the contract, the ids and the chat shape.
3. 0005, 0006: the database and how to touch it safely.
4. 0007, 0008, 0016: tests and failure behavior.
5. 0010 to 0012: the product model, wording and slugs.
6. 0002, 0009, 0013: storage, process and service auth, when your change needs them.

## Format

Files are named `NNNN-kebab-title.md`, numbered in the order they were accepted. Each uses the sections Status, Context, Decision, Consequences and Alternatives considered (Michael Nygard format), and the standard frontmatter plus `adr_id`, `decision_status` and `supersedes`. Label target-state items "Target" and current behavior "Current". Cite files and symbols, not line numbers.

## Changing a decision

1. Do not edit an accepted ADR to reverse it. Write a new ADR, set its `supersedes`, and change the old one's `decision_status` to "Superseded by NNNN".
2. Small corrections (a wrong path, a clarified consequence) can edit the ADR in place. Bump `version` and `last_updated`.
3. For a cross-service ADR, open the matching change in `sineva-ai` in the same effort.
4. Update [agent rules](../governance/agent_rules.md) and the index above in the same change.

## Related

Folders: [governance](../governance/README.md) (rules and process), [engineering](../engineering/README.md), [api-spec](../api-spec/README.md).
Rules that cite these ADRs: R-07 (0004), R-15 to R-22, R-39, R-42 (0005, 0006, 0014), R-23 (0003), R-26, R-41 (0008, 0016), R-29 (0013), R-33 to R-37 (0010 to 0012), R-40 (0015).
