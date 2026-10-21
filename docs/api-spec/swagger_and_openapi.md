---
title: "OpenAPI Document and API Docs Page"
category: "api-spec"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "openapi", "api-docs", "swagger", "documentation"]
summary: "Where the OpenAPI 3.1 document lives, what /api/openapi.json and /api-docs actually do, which parts of it are incomplete, and how to register a route."
related_docs:
  - "README.md"
  - "overview.md"
  - "agents_and_chat_endpoints.md"
  - "storage_and_health_endpoints.md"
  - "../governance/agent_rules.md"
  - "../development/known_issues_and_tech_debt.md"
---

# OpenAPI document and API docs page

"Current" is what the code does. "Target" is decided but not built.

## Gotchas first

- `/api-docs` is a static view, not Swagger UI. It lists the paths and prints the JSON. There is no "try it" runner. Some UI text still says "Swagger UI" (the command palette item and a link in the dashboard); that text is wrong.
- `swagger-ui-react` and `@types/swagger-ui-react` are in `apps/web/package.json` and imported nowhere. They are an unused dependency.
- The spec is a hand-written object, not generated from the Zod schemas. Nothing fails when a schema and the spec disagree, except the few assertions listed below.
- No test checks that every route file is registered. R-25 is enforced by review.

## Where things live

| Piece | Location |
| :--- | :--- |
| The document | `apps/web/src/server/infrastructure/openapi/spec.ts`, function `getOpenApiSpec()` (OpenAPI `3.1.0`, `info.version` `1.0.0`) |
| JSON endpoint | `GET /api/openapi.json`, `apps/web/src/app/api/openapi.json/route.ts` |
| Docs page | `/api-docs`, `apps/web/src/app/api-docs/page.tsx` |

`/api/openapi.json` returns the object with `NextResponse.json` directly. It is the only route that does not use `response_helper`, because it returns the OpenAPI document, not the platform envelope. R-24's check (`grep -rn "NextResponse.json" apps/web/src/app`) expects exactly this one match.

`/api-docs` is a server component. It imports `getOpenApiSpec` from `server/infrastructure/openapi/spec`. `architecture.test.ts` allows that one import from `app` because the spec is a static, dependency-free module. The page renders each path with its methods, summaries and `operationId`s, then the full JSON in a `<pre>` block. It also has links to `/api/openapi.json` and back to the home page.

## What the document covers

| Path | Methods | Documented responses |
| :--- | :--- | :--- |
| `/api/v1/health` | GET | 200 |
| `/api/v1/agents` | GET, POST | GET: 200. POST: 201, 409, 422 |
| `/api/v1/agents/{agent_slug}/chat` | POST | 200, 404, 422, 502, 503 |
| `/api/v1/storage/presign` | POST | 201 |

Operation ids: `get_system_health`, `list_agents`, `create_agent`, `send_agent_chat_message`, `presign_storage_upload`. Schemas: `StandardEnvelope`, `CreateAgentRequest`, `SendAgentChatRequest`, `AgentChatReply`, `AgentChatResponseEnvelope`, `PresignUploadRequest`. `servers` lists only `http://localhost:3000`.

The chat route is the complete one: request, reply schema and example, and the 404, 422, 502 and 503 examples.

### Gaps against the implementation

- Health, list and presign responses reference the generic `StandardEnvelope`. There is no schema for the health subsystems, `AgentView` or the presign result.
- Query and body constraints are mostly missing: no `minimum` or `maximum` on `page` and `per_page`, no length limits, no slug pattern, no 100 MiB cap on `file_size_bytes`, and `category` in `CreateAgentRequest` has no enum.
- `422` and `500` are not documented on the health, list and presign operations. The 422 on `POST /api/v1/agents` has no body schema.
- Example request ids (`req_1760980000_ab12cd`) do not match the real format (`req_<13 digit ms>_<up to 8 chars>`).
- The `503` description on the chat operation states that the turn may have completed upstream and that a retry can run it twice. The earlier text said "Safe to retry", which was wrong (see [agents and chat endpoints](agents_and_chat_endpoints.md)).
- The tag description "multi-agent chat" no longer describes the product model ([ADR-0010](../decisions/0010-one-chat-with-mentions.md)). OpenAPI text is outside the user-facing wording rule ([ADR-0011](../decisions/0011-user-facing-wording.md)), but it should not mislead.

## The rule: every route is registered (R-25)

Every route handler under `src/app/api` has a path entry in `getOpenApiSpec()`, with request and response schemas in `components.schemas` and every status the handler can return. A new route is not done until `/api/openapi.json` shows it.

What guards it today (`src/__tests__/api_routes.test.ts`, verified by reading the file):

- the document is `3.1.0` and contains `/api/v1/health`;
- the chat operation has responses `200`, `404`, `422`, `502`, `503`, a `sinofinance` path example, a `session_id` that is optional and a UUID, and the exact `AgentChatReply` property list;
- `POST /api/v1/agents` has a `409` response;
- the serialized document contains no `sino-` or `sino_` string.

What nothing guards: a route file with no spec entry, a spec path with no route file, and a schema that drifts from its Zod DTO.

Target: a test that lists every `src/app/api/**/route.ts`, converts the folder path to an OpenAPI path (`[agent_slug]` to `{agent_slug}`), and asserts that each path and exported HTTP method exists in `spec.paths`, and the reverse. It would fail the build when a route is added without a spec entry. Write it test-first like any other change (R-01).

## How to register a route

1. Write the route handler and its test first (R-01). Keep the handler to parse, use case, response (R-11).
2. In `spec.ts`, add the path under `paths` with `tags`, `summary`, a `snake_case` `operationId`, `parameters` or `requestBody`, and a response for each status the handler can return: success, 422 if it parses input, 404 or 409 if a use case throws them, 502 or 503 if it calls `sineva-ai`, and 500.
3. Add request and response schemas under `components.schemas` with `snake_case` property names. Mirror the Zod constraints (lengths, ranges, enums). Put a real example on responses.
4. Use the error helper in `spec.ts` (`errorExample`) for error examples so the shape matches the envelope.
5. Run `npm run lint && npm run typecheck && npm run test && npm run build`. Fetch `/api/openapi.json` and find the path (the R-25 check). Open `/api-docs` and see the path listed.
6. Update the route's doc in this folder in the same change (R-38).

## Target: an interactive viewer

If an interactive viewer is wanted, either use `swagger-ui-react` (already installed) on `/api-docs`, or remove the dependency and fix the "Swagger UI" labels. Keeping the dependency, the label and a static page together is the worst of the three. Pick one when the page is next touched.

## Related

[Overview](overview.md), [agents and chat endpoints](agents_and_chat_endpoints.md), [storage and health endpoints](storage_and_health_endpoints.md), [agent rules](../governance/agent_rules.md) (R-24, R-25), [known issues and tech debt](../development/known_issues_and_tech_debt.md).
