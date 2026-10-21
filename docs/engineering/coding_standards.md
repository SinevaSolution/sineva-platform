---
title: "Coding Standards"
category: "engineering"
status: "active"
version: "2.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "coding-standards", "typescript", "eslint", "prettier", "naming", "snake-case"]
summary: "What the TypeScript, ESLint and Prettier setups actually enforce, what they do not, the naming conventions in use, and the comment and commit rules."
related_docs:
  - "design_pattern.md"
  - "response_pattern.md"
  - "database_conventions.md"
  - "testing_strategy.md"
  - "../governance/agent_rules.md"
  - "../governance/git_and_pr_workflow.md"
---

# Coding Standards

This page describes the toolchain as configured, then the conventions that tooling does not enforce. Where the two differ, the gap is stated. Numbered rules are in [agent rules](../governance/agent_rules.md).

## 1. TypeScript

`apps/web/tsconfig.json` sets `"strict": true` and nothing stricter. `strict` covers `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict` and `useUnknownInCatchVariables`. Other relevant settings: `isolatedModules`, `skipLibCheck`, `allowJs`, `moduleResolution: "bundler"`, and the `@/*` path alias to `./src/*`.

Not enabled in `apps/web`:

- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- `noImplicitReturns`
- `noUnusedLocals`, `noUnusedParameters` (ESLint covers unused variables, see below)
- `noFallthroughCasesInSwitch`
- `noImplicitOverride`
- `noPropertyAccessFromIndexSignature`
- `verbatimModuleSyntax`

`packages/shared` and `packages/ui` do enable `noUncheckedIndexedAccess`. So `array[i]` is `T | undefined` there and `T` in the app. Do not assume the app's code would compile under the packages' settings. Write defensively for indexed access anyway.

Conventions the compiler does not check:

- Use `import type` for type-only imports, as the existing files do.
- Read untrusted data as `unknown` and narrow it with Zod or a type guard. Route handlers do `const body: unknown = await request.json()`.
- Declare return types on use-case and port methods, as the existing ones do. Nothing enforces return types on other functions.
- Read configuration through `getEnvConfig()` (`server/infrastructure/config/env.ts`), not `process.env` scattered through code. Debt: `GetSystemHealthUseCase` reads `process.env` directly.

## 2. ESLint

`apps/web/eslint.config.mjs` (flat config, ESLint 9) extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`, ignores `.next`, `node_modules`, `coverage`, `next-env.d.ts` and the generated Prisma client, and adds one custom rule block: `no-restricted-imports` on `src/client/**` blocking `@/server`, `@/server/*`, `../**/server/**` and `server-only`. `npm run lint` runs `eslint . --max-warnings 0`, so warnings fail it.

Verified from the resolved config:

| Rule | Level | Consequence |
| :--- | :--- | :--- |
| `@typescript-eslint/no-explicit-any` | error | `any` does not pass. Use `unknown` plus narrowing, or a generic. |
| `@typescript-eslint/no-unused-vars` | warning (fails under `--max-warnings 0`) | No `_` prefix escape is configured, so `_req` is still flagged. Remove the variable or use it. |
| `@typescript-eslint/ban-ts-comment` | error | No `@ts-ignore`. |
| `react-hooks/exhaustive-deps` | warning | Same: fails the run. |
| `react-hooks/set-state-in-effect` | error | Calling `setState` synchronously in an effect fails lint. |
| `prefer-const` | error | |

Not enabled: `no-empty`, `no-console`, `@typescript-eslint/no-floating-promises`, `@typescript-eslint/no-non-null-assertion`, `@typescript-eslint/consistent-type-imports`, `@typescript-eslint/explicit-function-return-type`. Consequences:

- An empty `catch` passes lint. R-26 is checked by grep and review.
- A forgotten `await` passes lint.
- `console.error` is used by the AI gateway for server logs. There is no logger abstraction yet.

The packages have no ESLint. Their `lint` script is `tsc --noEmit`.

## 3. Prettier

`.prettierrc.json` sets `semi: true`, `singleQuote: true`, `tabWidth: 2`, `trailingComma: "all"` and `printWidth: 100`. Root scripts `format` and `format:check` run Prettier on `**/*.{ts,tsx,md,json}`.

Debt: the code is wrapped at about 80 columns, and `npx prettier --check` currently reports style issues in the files it was run on across `app`, `client` and `server`. CI does not run `format:check`. Until the team picks a width and reformats in one dedicated commit:

- Do not run `npm run format` over the repo, and do not reformat files you are not otherwise changing (R-05).
- Match the surrounding file.
- Never mix a reformat with a behavior change in one commit.

## 4. Naming

| What | Convention | Examples |
| :--- | :--- | :--- |
| Files (`.ts`, `.tsx`) | `snake_case` | `agent_repository.ts`, `sineva_dashboard.tsx`, `response_helper.ts` |
| Framework-fixed files | As Next requires | `page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, `error.tsx`, `not-found.tsx` |
| Test files | `<subject>.test.ts`; integration `<subject>.int.test.ts`; contract `<subject>.contract.test.ts` | `use_cases.test.ts`, `prisma_agent_repository.int.test.ts` |
| Test doubles | `fake_<name>.ts`, class `Fake<Name>` | `fake_cache.ts`, `FakeCache` |
| Classes, interfaces, type aliases, React components | `PascalCase`, no `I` prefix on interfaces | `AgentEntity`, `AgentRepository`, `SinevaDashboard` |
| Functions, methods, locals, class fields | `camelCase` | `handleRouteError`, `findBySlug`, `agentRepository` |
| Data keys: entity fields, DTO and JSON keys, query params, Redux state keys, DB tables and columns | `snake_case` | `agent_slug`, `per_page`, `selected_agent_slug`, `agent_configs` |
| Module constants and env vars | `UPPER_SNAKE_CASE` | `INTERNAL_API_KEY_HEADER`, `AI_ENGINE_INTERNAL_URL` |
| Zod schemas | `<name>Schema` | `sendAgentChatDtoSchema` |
| Redux action creators | `camelCase` verbs; slice `name` is `snake_case` | `setSelectedAgentSlug`, `'agent_companion'` |

Exceptions that exist: the folder `server/application/use-cases/` is kebab-case, the route folder `api-docs` is kebab-case because it is a URL, and port method parameters use `snake_case` (`findBySlug(agent_slug)`). Do not rename them in passing; follow them in the same folder.

`snake_case` for data keys is a hard rule (R-23, R-21, [ADR-0003](../decisions/0003-snake-case-wire-contract.md)). Code identifiers around the data are `camelCase`. The wire, the database and Redux state must never need a key-mapping layer.

## 5. Comments

- Explain why, not what. The code says what. Write down the reason this approach beat the obvious one, and the gotcha a reader would otherwise hit. `container.ts` and `prisma_client.ts` are good models.
- A comment must stand alone. No ticket or plan ids, no "added for X", no process notes ("fixed per review").
- Do not delete a comment as a side effect of an edit. Remove it only when its subject is gone or it is clearly stale residue.
- Do not narrate obvious lines or restate a name.
- User-facing strings are not code comments: they follow the [wording rules](../product/product_model_and_wording.md).

## 6. Errors and failures

- No empty `catch`, no fabricated data, no silent fallback (R-26). See [error handling and failure modes](error_handling_and_failure_modes.md).
- Adapters throw domain errors. Route handlers do not invent statuses.
- Do not add hardcoded secret defaults (R-28).

## 7. Commits and PRs

Conventional Commits (`<type>(<scope>): <subject>`, imperative, lowercase, 72 characters or fewer) and the PR template with evidence are required (R-03, R-04). See [git and PR workflow](../governance/git_and_pr_workflow.md).

## 8. Before you push

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

Add `npm run test:integration` when database code changed (R-02). Details: [testing strategy](testing_strategy.md).
