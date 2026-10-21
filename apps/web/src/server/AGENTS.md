# AGENTS.md: apps/web/src/server

Backend code. It never ships to the browser. Rules R-07 to R-14, R-24 to R-29, R-40, R-41; decisions ADR-0004, ADR-0008, ADR-0015, ADR-0016. Layer table and traced request: `docs/project-structure/clean_architecture_layers.md`.

## Layers

- `domain/`: entities, ports (`repositories/`), `errors/domain_error.ts`. No `next`, `react`, ORM, driver or AWS SDK imports. Do not add imports from `@sineva/shared` (the one in `domain_error.ts` is debt).
- `application/`: use cases (`use-cases/`, one class per intent, ports injected through the constructor, `execute`) and Zod DTOs (`dtos/`). Imports only `domain`.
- `infrastructure/`: adapters for the ports, config, OpenAPI spec. Imports `domain`, never `application` or `http`.
- `http/`: `response_helper.ts` and the view-contract guards.
- `container.ts`: the only place adapters are constructed.

`architecture.test.ts` blocks specific layers and packages, not every other import. Keep "only domain" true by review.

## Container

- Add a lazy memoized getter for each new use case. Never `new` an adapter in a route, a page or a use case.
- No I/O at import time: `next build` imports every route module.
- There is no reset function. Route tests replace `@/server/container` with `vi.mock`.

## Adapters

- First line of every file under `infrastructure/` (and `container.ts`): `import 'server-only';`. Vitest aliases it to `src/__tests__/stubs/server_only.ts`; keep the alias.
- Throw `DomainError` subclasses. Translate what you understand (`P2002` to `ConflictError`), rethrow the rest.
- No silent fallbacks (R-26): no empty `catch`, no invented data, no health check that does not check. The AI gateway is the model: network, timeout or abort is `UpstreamUnavailableError` (503); non-2xx, non-JSON or an envelope that fails Zod is `UpstreamServiceError` (502).
- sineva-ai owns the chat contract. Auth header is `X-Internal-Api-Key`. Never expose its port or call it from the browser.
- Do not edit `infrastructure/database/generated` (gitignored `prisma generate` output).
- Read config through `getEnvConfig()`. Do not add hardcoded secret defaults (R-28).

## Wire types

A shape the browser reads goes in `src/shared/<name>_view.ts` with a guard in `http/<name>_view_contract.ts` (`AssertAssignable<Server, View>`). Add both together (R-14).

## Known debt: do not copy

- `DomainError` carries an HTTP `status` and imports `@sineva/shared`.
- In-memory "Redis" cache with `ping()` always true; presign returns an unsigned URL on error; no real Postgres health check; hardcoded `engine_version`.
- New-agent defaults live in `PrismaAgentRepository.create`.
- `user_id` and `workspace_id` come from request bodies (R-27); do not extend that.

## Where to read

- `docs/engineering/design_pattern.md`, `error_handling_and_failure_modes.md`, `response_pattern.md`
- `docs/development/feature_development_workflow.md` for the slice order
- `apps/web/prisma/AGENTS.md` for anything that touches the schema
