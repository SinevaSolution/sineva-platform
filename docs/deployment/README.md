---
title: "Deployment"
category: "deployment"
status: "active"
version: "1.0.0"
last_updated: "2026-10-21"
owner: "Sineva Engineering"
tags: ["sineva", "deployment", "docker", "ci-cd", "environment", "index"]
summary: "Index of the docs for running and releasing the stack: compose topology, network security, environment variables and the CI/CD pipeline."
related_docs:
  - "../README.md"
  - "../engineering/README.md"
  - "../troubleshooting/README.md"
  - "../governance/agent_rules.md"
---

# Deployment

How the Sineva stack is run and released: the Docker Compose topology, how `sineva-ai` is isolated, every environment variable, and the CI workflow and release order including database migrations. It does not cover how to write code or tests ([engineering](../engineering/README.md)), how to fix a broken stack ([troubleshooting](../troubleshooting/README.md)), or the schema itself ([database conventions](../engineering/database_conventions.md)).

## Files

| File | What it covers | Read it when |
| :--- | :--- | :--- |
| [docker_compose_topology.md](docker_compose_topology.md) | The nine services, published ports, volumes, startup order, `docker:reset` (`down -v`) danger | You run the stack or change `docker-compose.yml` |
| [internal_network_security.md](internal_network_security.md) | No host port for `sineva-ai`, `X-Internal-Api-Key`, key rotation, remaining gaps | You touch service-to-service calls or secrets |
| [environment_variables.md](environment_variables.md) | Every variable: required or default, where it is read, secret defaults that are debt | You add, rename or debug configuration |
| [secret_inventory.md](secret_inventory.md) | Inventory of production secrets, rotation policies, and injection methods | You deploy, rotate secrets, or configure production |
| [ci_cd_pipeline.md](ci_cd_pipeline.md) | What CI runs, the Dockerfile stages, release order, rollout checklist | You change CI, the image or a release |
| [connections_runbook.md](connections_runbook.md) | Job tick schedule, vault database roles, key rotation, restore sweep, provider mass revoke | You operate Connected tools or the vault |

- [Node.js security patch, 22 October 2026](node-security-2026-10-22.md): runtime baseline, CVE evidence and rollout verification.

## Suggested reading order

1. `docker_compose_topology.md` to see what runs.
2. `environment_variables.md` to configure it.
3. `internal_network_security.md` for what is and is not protected.
4. `ci_cd_pipeline.md` before a release, with [database migrations workflow](../engineering/database_migrations_workflow.md) open.

## Related

- Folders: [engineering](../engineering/README.md), [troubleshooting](../troubleshooting/README.md), [project-structure](../project-structure/README.md).
- Rules: R-16 to R-20 and R-42 (Prisma and migrations), R-28 (secrets), R-29 (`sineva-ai` internal only). See [agent rules](../governance/agent_rules.md).
- Decisions: [ADR-0001](../decisions/0001-bff-gateway.md), [ADR-0002](../decisions/0002-seaweedfs-presigned-uploads.md), [ADR-0006](../decisions/0006-shared-postgres-platform-schema.md), [ADR-0013](../decisions/0013-internal-service-auth-header.md).
