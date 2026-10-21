---
title: "Governance"
category: "governance"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "governance", "rules", "process", "index"]
summary: "Index of the rules and process docs that govern every change to sineva-platform."
related_docs:
  - "../README.md"
  - "agent_rules.md"
  - "git_and_pr_workflow.md"
  - "../decisions/README.md"
---

# Governance

This folder holds the rules for changing the repository and the process for getting a change merged. It covers what you MUST and MUST NOT do (the numbered R-xx rules) and how commits and pull requests are written. It does not hold the reasons behind architecture choices (those are ADRs in [decisions](../decisions/README.md)), how the code is structured ([project-structure](../project-structure/README.md)), or how to write a feature step by step ([development](../development/README.md)).

The root [`AGENTS.md`](../../AGENTS.md) summarizes the rules and routes you here. Rule numbers are stable and other docs cite them. If a rule and its ADR disagree, the ADR wins and the rule gets fixed.

| File | What it covers | Read it when |
| :--- | :--- | :--- |
| [agent_rules.md](agent_rules.md) | R-01 to R-42: process, architecture, data, contract, reliability, frontend, product and docs rules, each with a reason and a check; the known-debt list | You start any change, review one, or need a rule's check command |
| [git_and_pr_workflow.md](git_and_pr_workflow.md) | Commit format, the PR template, what counts as evidence, the done checklist | You are about to commit or open a pull request |

## Suggested reading order

1. [agent_rules.md](agent_rules.md): at least Process (R-01 to R-06) and the group that matches your change (Architecture, Data, Contract, Reliability and security, Frontend, Product and docs).
2. [git_and_pr_workflow.md](git_and_pr_workflow.md): before your first commit.
3. The known-debt list at the end of `agent_rules.md`, so you do not copy a pattern that is already marked as debt.

## Related

- Rules by topic: tests and verification R-01, R-02; commits and PRs R-03, R-04; layers R-07 to R-14; Prisma and the database R-15 to R-22, R-39, R-42; wire contract R-23 to R-25, R-40; failures and security R-26 to R-29, R-41; UI R-30 to R-32; wording and slugs R-33 to R-37; docs R-38.
- Decisions behind them: [ADR-0007](../decisions/0007-tdd-fakes-integration-containers.md) (TDD), [ADR-0009](../decisions/0009-conventional-commits-and-pr-template.md) (commits and PRs), [ADR-0004](../decisions/0004-web-app-structure-and-dependency-rules.md) (layers), [ADR-0008](../decisions/0008-no-silent-fallbacks.md) and [ADR-0016](../decisions/0016-upstream-failures-return-502-503.md) (failures). Full list: [decisions index](../decisions/README.md).
- Folders: [engineering](../engineering/README.md) for conventions, [development](../development/README.md) for the feature workflow and tech debt, [deployment](../deployment/README.md) for CI.
