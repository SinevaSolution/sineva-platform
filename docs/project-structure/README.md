---
title: "Project Structure"
category: "project-structure"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "architecture", "project-structure", "index"]
summary: "Index of the architecture docs: system topology, the monorepo workspaces, the backend layers and the frontend structure."
related_docs:
  - "../README.md"
  - "overview.md"
  - "turborepo_workspaces.md"
  - "clean_architecture_layers.md"
  - "frontend_architecture.md"
---

# Project Structure

This folder explains how `sineva-platform` is organized: what the system connects to, how the monorepo is split, where backend and frontend code live, and which import rules keep them apart. It does not cover coding style (see [engineering](../engineering/README.md)), database schema or migrations (engineering), API payloads ([api-spec](../api-spec/overview.md)), or deployment ([deployment](../deployment/docker_compose_topology.md)).

## Files

| File | What it covers | Read it when |
| :--- | :--- | :--- |
| [overview.md](overview.md) | Topology with sineva-ai, Postgres, Redis and SeaweedFS, which links are real today, repository layout, the core decisions | You are new to the repo, or need to know what talks to what |
| [turborepo_workspaces.md](turborepo_workspaces.md) | The three workspaces, their dependencies, what each turbo task runs, how to add to a package | You add a package, change a script, or a build or lint step fails |
| [clean_architecture_layers.md](clean_architecture_layers.md) | Layer table with allowed imports, what `architecture.test.ts` checks and misses, the container, `server-only`, view-type guards, a traced chat request | You decide where code goes, add a port or adapter, or an architecture test fails |
| [frontend_architecture.md](frontend_architecture.md) | Current client dashboard versus the target, rules for new UI, how chat handles 502 and 503, markdown debt | You build or change UI |

## Suggested reading order

1. [overview.md](overview.md)
2. [clean_architecture_layers.md](clean_architecture_layers.md)
3. [frontend_architecture.md](frontend_architecture.md)
4. [turborepo_workspaces.md](turborepo_workspaces.md) when you touch build or packages

## Related

- Folders: [engineering](../engineering/README.md), [development](../development/README.md), [decisions](../decisions/README.md), [governance](../governance/agent_rules.md).
- Rules: R-07 to R-14 (layers and boundaries), R-30 to R-32 (frontend), in [agent rules](../governance/agent_rules.md).
- Decisions: [ADR-0001](../decisions/0001-bff-gateway.md), [ADR-0004](../decisions/0004-web-app-structure-and-dependency-rules.md), [ADR-0015](../decisions/0015-sineva-ai-owns-internal-chat-contract.md).
