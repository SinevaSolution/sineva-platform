---
title: "Git and PR Workflow"
category: "governance"
status: "active"
version: "1.1.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "git", "commits", "pull-request", "workflow", "review"]
summary: "How to write commits and pull requests in sineva-platform: Conventional Commits, the PR template, and what counts as evidence."
related_docs:
  - "README.md"
  - "agent_rules.md"
  - "../decisions/0009-conventional-commits-and-pr-template.md"
  - "../decisions/0007-tdd-fakes-integration-containers.md"
  - "../development/feature_development_workflow.md"
  - "../deployment/ci_cd_pipeline.md"
---

# Git and PR Workflow

Decision record: [ADR-0009](../decisions/0009-conventional-commits-and-pr-template.md). Rules: R-03 and R-04 in [agent rules](agent_rules.md).

## Flow

1. Write the failing test, run it, see it fail ([ADR-0007](../decisions/0007-tdd-fakes-integration-containers.md)). Keep the red output.
2. Make it pass with the smallest change.
3. From the repository root, run:
   ```bash
   npm run lint && npm run typecheck && npm run test && npm run build
   ```
   Add `npm run test:integration` when database code changed. It needs `TEST_DATABASE_URL` pointing at a throwaway database whose name contains "test". CI does not run it, so your local output is the evidence.
4. Commit in logical pieces, each with a Conventional Commit message.
5. Open a pull request with the template below.

## Commit messages

Format: `<type>(<scope>): <subject>`

| Type | Use for |
| :--- | :--- |
| `feat` | A new feature |
| `fix` | A bug fix |
| `refactor` | A change with no behavior change |
| `test` | Adding or correcting tests |
| `docs` | Documentation only |
| `perf` | A performance improvement |
| `style` | Formatting only |
| `build` | Build system or dependencies that affect the build |
| `ci` | CI configuration |
| `chore` | Tooling and maintenance with no source behavior change |
| `revert` | Reverting an earlier commit |

Rules:

- Subject: imperative mood, lowercase, no trailing period, 72 characters or fewer.
- Scope: the module or area touched, for example `server`, `client`, `prisma`, `api`, `docs`. Optional, preferred.
- Breaking change: add `!` after the type or scope and a `BREAKING CHANGE:` footer describing the break and the migration.
- Body (optional, after a blank line): explain why, not what. Reference issues with `Refs #123` or `Closes #123`.
- A change that spans unrelated types becomes separate commits. A refactor and a bug fix do not share a commit.

Examples:

```text
feat(server): add prisma-backed agent repository
fix(gateway): send x-internal-api-key to sineva-ai
refactor(client): move dashboard components under src/client
docs(decisions): record prisma 7.10.1 pin
feat(api)!: rename per_page query param to page_size

BREAKING CHANGE: clients must send page_size instead of per_page.
```

## Pull request template

Fill the sections that apply and delete the rest. Do not write a one-line description or copy the commit subject.

```markdown
## Summary
<!-- What and why in 2-4 sentences: the problem and the approach. -->

## Changes
<!-- Concrete changes, grouped by area or module. -->
- feat: ...
- fix: ...
- refactor: ...

## Type of change
- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change
- [ ] Refactor / chore
- [ ] Docs only

## How to test
<!-- Steps a reviewer can follow to reproduce and verify locally. -->
1. ...
2. ...

## Testing checklist
- [ ] Unit tests written or updated and passing (`npm run test`)
- [ ] Integration/E2E tests passing where relevant (`npm run test:integration`)
- [ ] Linter and formatter clean (`npm run lint`)
- [ ] Type check and build passing (`npm run typecheck`, `npm run build`)
- [ ] Manually verified the affected flow end to end
- [ ] No secrets, keys or debug logging in the diff
- [ ] Backwards compatible, or migration and rollback documented below

## Screenshots / logs
<!-- UI changes: before and after. Behavior changes: relevant output or logs. -->

## Related
<!-- Closes #123, Refs #456, design or ticket links. -->

## Notes for reviewers
<!-- Risk areas, trade-offs made, follow-ups deliberately deferred. -->
```

## Evidence, not assertion

A ticked box needs something a reviewer can check:

- Test items: the failing output before the change and the passing output after, or the command and its summary line.
- Build, lint, typecheck: the command and exit status.
- Manual verification: the steps you ran and what you saw. For UI, a screenshot or recording.
- Database changes: the migration SQL path, the throwaway database you ran it against, and the rollback plan.
- "Not applicable" is a valid answer when you say why.

An unticked box with a reason beats a ticked box with none.

## Review checklist for reviewers

- Is there a test that failed before the change?
- Do the layer rules and the client/server boundary still hold (`architecture.test.ts` passes)?
- Any new route registered in OpenAPI, snake_case on the wire, envelope through `response_helper`?
- Any silent fallback, empty catch or hardcoded secret introduced ([ADR-0008](../decisions/0008-no-silent-fallbacks.md))? Do upstream failures stay typed 502 or 503 ([ADR-0016](../decisions/0016-upstream-failures-return-502-503.md))?
- Schema change: committed migration SQL, UUID primary key with `gen_random_uuid()` ([ADR-0014](../decisions/0014-uuid-primary-keys.md)), `@@schema("platform")`, and a release note that deploy uses `?schema=platform` (R-42)?
- Chat contract change: fixtures updated in `sineva-ai` first and copied byte for byte, with the matching `sineva-ai` change linked ([ADR-0015](../decisions/0015-sineva-ai-owns-internal-chat-contract.md))?
- Does user-facing copy follow [ADR-0011](../decisions/0011-user-facing-wording.md)?
- Are the affected docs updated in the same change?

## Surgical changes

Touch only what the task needs. If you notice an adjacent problem, describe it in "Notes for reviewers" or open an issue. Do not fix it in the same change.
