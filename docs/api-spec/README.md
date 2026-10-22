---
title: "API Specification"
category: "api-spec"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "api-spec", "index", "rest"]
summary: "Index of the public HTTP API docs for sineva-platform: envelope and errors, each route as implemented, the internal contract with sineva-ai, and how the OpenAPI document is kept."
related_docs:
  - "overview.md"
  - "agents_and_chat_endpoints.md"
  - "storage_and_health_endpoints.md"
  - "profile_and_preferences_endpoints.md"
  - "members_and_invitations_endpoints.md"
  - "swagger_and_openapi.md"
  - "../README.md"
---

# API specification

This folder documents the HTTP routes under `apps/web/src/app/api` exactly as they behave today: methods, paths, request schemas, response bodies, and every status code a route can return. It also holds the contract between the platform and `sineva-ai`. It does not hold route design proposals (use [future features template](../development/future_features_template.md)), database tables ([database conventions](../engineering/database_conventions.md)), or how to write a handler ([design patterns](../engineering/design_pattern.md)).

"Current" is what the code does. "Target" is decided but not built.

| File | What it covers | Read it when |
| :--- | :--- | :--- |
| [overview.md](overview.md) | Route inventory, the `@sineva/shared` envelope, request id and timestamp, error codes, conventions, what the API does not have yet | You call the API, or you add or change a route |
| [agents_and_chat_endpoints.md](agents_and_chat_endpoints.md) | `GET /api/v1/workspaces/{workspace_id}/agents` (the specialist roster), and the internal contract with `sineva-ai` | You build the chat UI, change the gateway, or touch the fixtures |
| [storage_and_health_endpoints.md](storage_and_health_endpoints.md) | `POST /api/v1/storage/presign` and `GET /api/v1/health`, including what "healthy" really checks | You upload files, wire a health probe, or debug a standby subsystem |
| [profile_and_preferences_endpoints.md](profile_and_preferences_endpoints.md) | `/api/v1/me`, member attributes, preferences, avatar upload and its image checks | You touch the profile page, preferences or avatars |
| [members_and_invitations_endpoints.md](members_and_invitations_endpoints.md) | Members, roles, specialist scope, invitations, leaving, ownership transfer, and the sign-up-by-invitation flow | You build the members UI, the invite or ownership pages, or touch roles |
| [inbox_and_approvals_endpoints.md](inbox_and_approvals_endpoints.md) | The Inbox and approval routes, the internal routes and expiry job for sineva-ai, and the proposed approval contract | You touch the Inbox, approvals, input requests or the run resume call |
| [swagger_and_openapi.md](swagger_and_openapi.md) | Where the OpenAPI document lives, what `/api-docs` is (and is not), how to register a route | You add a route or change a schema |

## Reading order

1. [overview.md](overview.md) for the envelope and the error table.
2. [agents_and_chat_endpoints.md](agents_and_chat_endpoints.md), then [storage_and_health_endpoints.md](storage_and_health_endpoints.md).
3. [swagger_and_openapi.md](swagger_and_openapi.md) before you open a PR that adds or changes a route.

## Related

- Rules: R-11 (thin handlers), R-23 (`snake_case`), R-24 (`response_helper`), R-25 (register routes), R-27 (identity), R-40 and R-41 (sineva-ai contract and failures). See [agent rules](../governance/agent_rules.md).
- Decisions: [ADR-0001](../decisions/0001-bff-gateway.md), [ADR-0003](../decisions/0003-snake-case-wire-contract.md), [ADR-0013](../decisions/0013-internal-service-auth-header.md), [ADR-0015](../decisions/0015-sineva-ai-owns-internal-chat-contract.md), [ADR-0016](../decisions/0016-upstream-failures-return-502-503.md).
- Known gaps in the API (no auth, identity from the body, presign, health): [known issues and tech debt](../development/known_issues_and_tech_debt.md).
- Folders: [engineering](../engineering/response_pattern.md) for the envelope helpers, [product](../product/README.md) for what each product may do.
