---
title: "ADR-0009: Conventional Commits and the PR template"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "git", "commits", "pull-request", "process"]
summary: "Every commit follows Conventional Commits, and every pull request uses a structured description with evidence for each checklist item."
related_docs:
  - "../governance/git_and_pr_workflow.md"
  - "../governance/agent_rules.md"
  - "0007-tdd-fakes-integration-containers.md"
adr_id: "0009"
decision_status: "Accepted"
supersedes: []
---

# ADR-0009: Conventional Commits and the PR template

## Status

Accepted (2026-10-21).

## Context

Free-form commit messages and one-line pull request descriptions make history hard to scan and give reviewers nothing to verify. Checklists ticked without output prove nothing.

## Decision

Commits follow `<type>(<scope>): <subject>`.

- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `style`, `ci`, `build`, `revert`. Pick the type that matches the change.
- Scope is the module or area touched (`feat(auth)`, `fix(web)`). Optional, preferred.
- Subject: imperative mood, lowercase, no trailing period, 72 characters or fewer.
- Breaking change: `!` after the type or scope, plus a `BREAKING CHANGE:` footer.
- Body (optional): the why, not the what. Reference issues with `Refs #123` or `Closes #123`.
- A change spanning unrelated types is split into separate commits.

Pull request descriptions use the template in [git and PR workflow](../governance/git_and_pr_workflow.md): Summary, Changes, Type of change, How to test, Testing checklist, Screenshots/logs, Related, Notes for reviewers. Fill the sections that apply and delete the rest. Each testing-checklist item is ticked only with evidence: the command run and its result, or a log or screenshot.

## Consequences

- History reads as a changelog, and breaking changes are visible in the log.
- Reviewers see what was run, not what was claimed.
- Splitting mixed changes takes extra effort at commit time.

## Alternatives considered

- Free-form messages. Rejected: no scannable history, no machine-readable breaking-change signal.
- A short PR description with a copied commit subject. Rejected: it gives a reviewer no way to reproduce or verify the change.
