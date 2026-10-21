# AGENTS.md: apps/web/src/app

The routing edge: pages, layouts and `/api/v1/*` route handlers. Rules R-10, R-11, R-23 to R-25, R-27, R-31; decisions ADR-0003, ADR-0004, ADR-0016. Handler shape and statuses: `docs/engineering/response_pattern.md`. Traced example: `docs/project-structure/clean_architecture_layers.md`.

## Route handlers

Three steps, nothing else:

1. Parse: read the body as `unknown` and call the DTO schema from `@/server/application/dtos` (`.parse`). Query strings go through a schema too.
2. Call: get the use case from `@/server/container` and `execute`.
3. Respond: `sendSuccessJson`, `sendPaginatedJson` or `handleRouteError` from `@/server/http/response_helper`. Wrap the body in `try`, and the `catch` calls `handleRouteError`.

- No business logic, no SQL, no `fetch`, no `@/server/infrastructure` imports. The only allowed one is the static spec, `@/server/infrastructure/openapi`.
- No `new SomeRepository()`. The container builds adapters.
- Never `NextResponse.json` for an API result: it hides the envelope. Only `/api/openapi.json` returns a raw document.
- Keys in bodies, queries and responses are `snake_case` (R-23).
- `context.params` is a Promise in Next 16: `await` it.
- Do not read identity (`user_id`, `workspace_id`) from the body in new code (R-27). Chat and presign do today; flag it and do not extend it.

## New or changed route

- Failing route test first (`src/__tests__/api_routes.test.ts` style, container mocked with fakes): success status, 422 for a bad body, each domain error.
- Register it in `server/infrastructure/openapi/spec.ts` with every status it can return, including 502 and 503 for upstream calls (R-25).
- A malformed JSON body is a 500 today (`request.json()` throws). Do not rely on it as a validation path.
- A new payload the browser reads needs a view in `src/shared` and a guard in `server/http`.

## Pages and layouts

- Server components by default. Fetch through the container, pass serializable props typed with `src/shared` views.
- Every new route segment has `loading.tsx`, `error.tsx` and, where an id can be missing, `not-found.tsx`. None exist yet (R-31).
- `layout.tsx` wraps the app in `AppProviders` (Redux, theme, toasts). Keep it a thin shell.
- `app/page.tsx` is `force-dynamic` and passes agents to the client dashboard. It is the current pattern, not the target ([frontend architecture](../../../../docs/project-structure/frontend_architecture.md)).
- `/api-docs` renders the OpenAPI document as a static page, not Swagger UI.

## Copy and tokens

User-facing text follows the wording rules (R-33 to R-37). Styling uses semantic tokens (R-30). Route `message` strings can reach users (the chat toast shows error messages), so use "companion", never "assistant" or "chatbot".
