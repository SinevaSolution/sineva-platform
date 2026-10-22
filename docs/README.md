---
title: 'Sineva Platform Documentation Index'
category: 'root'
status: 'active'
version: '2.1.0'
last_updated: '2026-10-21'
owner: 'Sineva Engineering'
tags: ['sineva', 'platform', 'documentation', 'index']
summary: 'Index of every folder and document under docs/, with the folder READMEs and a pointer to the rules and decisions that govern changes.'
related_docs:
  - 'governance/README.md'
  - 'governance/agent_rules.md'
  - 'decisions/README.md'
  - 'project-structure/overview.md'
---

# Sineva Platform Documentation

Index of the docs for `sineva-platform`. Start with the root [`AGENTS.md`](../AGENTS.md), which routes you by task. Every folder has a `README.md` that says what the folder is for, lists its files, and suggests a reading order. Every doc starts with YAML frontmatter (`title`, `category`, `status`, `version`, `last_updated`, `owner`, `tags`, `summary`, `related_docs`).

In these docs, "Current" means what the code does today and "Target" means decided but not yet built. Rules are cited as R-xx ([agent rules](governance/agent_rules.md)) and decisions as ADR-NNNN ([decisions](decisions/README.md)).

## Snapshot

| Attribute          | Value                                                                                                                                                       |
| :----------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository         | Turborepo monorepo: `apps/web`, `packages/shared`, `packages/ui`                                                                                            |
| Framework          | Next.js 16.4 App Router, React 19.2, TypeScript 5.7                                                                                                         |
| App structure      | One BFF app: `src/app` (routes), `src/server` (backend layers and container), `src/client` (frontend), `src/shared` (wire types)                            |
| Data               | Postgres 17 database `sineva_platform`, schema `platform` (Prisma 7.10.1, UUID keys), shared with `sineva-ai` (schema `sineva_ai`); Redis 7.4; SeaweedFS S3 |
| Wire contract      | `snake_case` JSON, shared response envelope                                                                                                                 |
| Internal AI engine | `sineva-ai`, internal network only, `X-Internal-Api-Key`; it owns the chat contract; failures return 502 or 503                                             |

## Governance (`governance/`)

Rules for changing the repository. Folder guide: [README](governance/README.md).

- [Agent Rules](governance/agent_rules.md): numbered MUST and MUST NOT rules, each with a reason and a check.
- [Git and PR Workflow](governance/git_and_pr_workflow.md): Conventional Commits, PR template, evidence.

## Decisions (`decisions/`)

Architecture decision records. Folder guide and index: [README](decisions/README.md).

- [0001 BFF gateway](decisions/0001-bff-gateway.md)
- [0002 SeaweedFS presigned uploads](decisions/0002-seaweedfs-presigned-uploads.md)
- [0003 snake_case wire contract](decisions/0003-snake-case-wire-contract.md)
- [0004 Web app structure and dependency rules](decisions/0004-web-app-structure-and-dependency-rules.md)
- [0005 Prisma replaces Drizzle](decisions/0005-prisma-replaces-drizzle.md)
- [0006 Shared Postgres platform schema](decisions/0006-shared-postgres-platform-schema.md)
- [0007 TDD, fakes and integration containers](decisions/0007-tdd-fakes-integration-containers.md)
- [0008 No silent fallbacks](decisions/0008-no-silent-fallbacks.md)
- [0009 Conventional Commits and PR template](decisions/0009-conventional-commits-and-pr-template.md)
- [0010 One chat with mentions](decisions/0010-one-chat-with-mentions.md)
- [0011 User-facing wording](decisions/0011-user-facing-wording.md)
- [0012 Canonical product slugs and guardrails](decisions/0012-canonical-product-slugs-and-guardrails.md)
- [0013 Internal service auth header](decisions/0013-internal-service-auth-header.md)
- [0014 UUID primary keys](decisions/0014-uuid-primary-keys.md)
- [0015 sineva-ai owns the internal chat contract](decisions/0015-sineva-ai-owns-internal-chat-contract.md)
- [0016 Upstream failures return 502 or 503](decisions/0016-upstream-failures-return-502-503.md)

## Project Structure (`project-structure/`)

Folder guide: [README](project-structure/README.md).

- [Overview](project-structure/overview.md): topology, shared data stores, repository layout.
- [Turborepo Workspaces](project-structure/turborepo_workspaces.md): workspace boundaries and the build graph.
- [Clean Architecture Layers](project-structure/clean_architecture_layers.md): backend layers and dependency rules.
- [Frontend Architecture](project-structure/frontend_architecture.md): `src/client`, `src/shared` and the client/server boundary.

## Engineering (`engineering/`)

Folder guide: [README](engineering/README.md).

- [Coding Standards](engineering/coding_standards.md): TypeScript, naming, lint and format.
- [Design Patterns](engineering/design_pattern.md): repository, use case, gateway, container.
- [Response Pattern](engineering/response_pattern.md): the `@sineva/shared` envelope and `response_helper`.
- [Error Handling and Failure Modes](engineering/error_handling_and_failure_modes.md): domain errors, 502 and 503, and what to do when a dependency fails.
- [Database Conventions](engineering/database_conventions.md): Prisma schema, naming, UUID keys, the `platform` schema.
- [Database Migrations Workflow](engineering/database_migrations_workflow.md): creating, reviewing and applying migrations safely.
- [Logging and PII Masking](engineering/logging_and_pii_masking.md): the logger wrapper, field allowlist, lint rule, identifier masking and shared vectors.
- [State Management with Redux](engineering/state_management_redux.md): store, slices, thunks.
- [Testing Strategy](engineering/testing_strategy.md): unit tests with fakes, contract tests, integration tests, architecture tests, CI.

## API Specification (`api-spec/`)

Folder guide: [README](api-spec/README.md).

- [Overview](api-spec/overview.md): versioning, envelope, errors, conventions.
- [Agents and Chat Endpoints](api-spec/agents_and_chat_endpoints.md)
- [Storage and Health Endpoints](api-spec/storage_and_health_endpoints.md)
- [Sino Library Endpoints](api-spec/library_endpoints.md)
- [Connections Endpoints](api-spec/connections_endpoints.md)
- [Swagger and OpenAPI](api-spec/swagger_and_openapi.md): how `/api/openapi.json` and `/api-docs` work, and how to register a route.

- [Onboarding and Business Profile](api-spec/onboarding_and_business_profile_endpoints.md): first workspace, resumable onboarding, confirmed profile, versions and scan proposal.

## Product (`product/`)

Folder guide: [README](product/README.md).

- [Product Model and Wording](product/product_model_and_wording.md): one chat, @mentions, companion wording, guardrails.

## Design Context (`design-context/`)

Folder guide: [README](design-context/README.md).

- [Design System](design-context/design_system.md)
- [Design Tokens](design-context/design_tokens.md)
- [UX and Frontend Libraries](design-context/ux_and_frontend_libraries.md)
- [Copywriting and Brand](design-context/copywriting_and_brand.md)

## Deployment (`deployment/`)

Folder guide: [README](deployment/README.md).

- [Docker Compose Topology](deployment/docker_compose_topology.md)
- [Internal Network Security](deployment/internal_network_security.md)
- [CI/CD Pipeline](deployment/ci_cd_pipeline.md)
- [Connections Runbook](deployment/connections_runbook.md)
- [Environment Variables](deployment/environment_variables.md)

## Development (`development/`)

Folder guide: [README](development/README.md).

- [Feature Development Workflow](development/feature_development_workflow.md)
- [Future Features Template](development/future_features_template.md)
- [Roadmap](development/roadmap.md)
- [Known Issues and Tech Debt](development/known_issues_and_tech_debt.md): current deviations from the rules, and their status.

## Troubleshooting (`troubleshooting/`)

Folder guide: [README](troubleshooting/README.md).

- [Common Issues](troubleshooting/common_issues.md)
- [Docker and Internal Network](troubleshooting/docker_and_internal_network.md)
- [Storage, Database and Redis](troubleshooting/storage_db_and_redis.md)

- [Checkpoint resume batch](development/resume-batch-2026-10-22.md): integrated M1 backends, functional UI, runtime fixes and outstanding acceptance work.

## Keeping the docs true

Update the affected doc in the same change as the code (rule R-38). When you add, move or delete a doc, update this index, the folder `README.md` and the `related_docs` of the files that link to it. There is no `docs/research/` folder: its content became ADR-0001, ADR-0002 and ADR-0010.
