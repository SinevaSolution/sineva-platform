---
title: 'Development'
category: 'development'
status: 'active'
version: '1.0.0'
last_updated: '2026-10-21'
owner: 'Sineva Engineering'
tags: ['sineva', 'development', 'index', 'roadmap', 'tech-debt', 'workflow']
summary: 'Index of the development docs: how to build a feature, how to propose one, what is planned and in what order, and the full list of known deviations and tech debt.'
related_docs:
  - 'feature_development_workflow.md'
  - 'future_features_template.md'
  - 'roadmap.md'
  - 'known_issues_and_tech_debt.md'
  - 'manual_test_invitations.md'
  - '../README.md'
  - '../governance/agent_rules.md'
---

# Development

This folder is for the person about to change the platform: the order to build a feature in, the template to propose one, the plan for what comes next, and the list of things that are wrong today. It does not hold the rules themselves ([governance](../governance/README.md)), the layer descriptions ([project-structure](../project-structure/overview.md)), or testing and error-handling detail ([engineering](../engineering/coding_standards.md)).

"Current" is what the code does. "Target" is decided but not built.

| File                                                               | What it covers                                                                                                                                            | Read it when                                                                                                  |
| :----------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| [feature_development_workflow.md](feature_development_workflow.md) | The vertical-slice steps, test first, where each file goes, Prisma, OpenAPI and `sineva-ai` contract steps, verification and the PR                       | You start any feature or bug fix                                                                              |
| [future_features_template.md](future_features_template.md)         | A feature spec template with sections for guardrails and wording, database migration, contract impact with `sineva-ai`, failure behavior and the ADR link | You propose a feature that changes a contract, the schema, a product's behavior, identity or failure handling |
| [roadmap.md](roadmap.md)                                           | What is real and what is a stub today, then hardening, one chat, and uncommitted ideas, each with exit evidence                                           | You pick what to build next, or check if work is already planned                                              |
| [known_issues_and_tech_debt.md](known_issues_and_tech_debt.md)     | Every known deviation, grouped by area with security first: symptom, root cause, location, severity, what not to copy, suggested fix                      | You work in an area, and before you copy any pattern you did not write                                        |
| [manual_test_invitations.md](manual_test_invitations.md) | Step-by-step manual test of invitations, roles, ownership transfer and sign-in methods on the dev server with Mailpit and two browsers | You want to try the people flows yourself, or check what each step should show |

## Reading order

1. [feature_development_workflow.md](feature_development_workflow.md).
2. [known_issues_and_tech_debt.md](known_issues_and_tech_debt.md) for the area you will touch.
3. [roadmap.md](roadmap.md) to see whether the change is already planned.
4. [future_features_template.md](future_features_template.md) if the change needs a spec.

## Related

- Rules: R-01 and R-02 (test first, verification), R-05 and R-06 (surgical edits, ask on ambiguity), R-38 (update docs in the same change). See [agent rules](../governance/agent_rules.md).
- Decisions: [ADR index](../decisions/README.md), especially [ADR-0007](../decisions/0007-tdd-fakes-integration-containers.md), [ADR-0008](../decisions/0008-no-silent-fallbacks.md) and [ADR-0015](../decisions/0015-sineva-ai-owns-internal-chat-contract.md).
- Folders: [engineering](../engineering/testing_strategy.md), [api-spec](../api-spec/README.md), [product](../product/README.md), [design-context](../design-context/README.md).

## Checkpoint continuation

- [22 October integration batch](resume-batch-2026-10-22.md): merged backends, screens, test evidence and remaining acceptance work.

- [Implementation plan alignment](implementation-plan-alignment-2026-10-22.md): WP status, current evidence, missing acceptance and next dependency order.
