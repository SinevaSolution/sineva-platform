---
title: "ADR-0038: Postgres-backed durable job runner"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "jobs", "worker", "postgres", "durable-execution"]
summary: "The platform runs vault-adjacent background work (token refresh, health probes, reconcile, reminders) on a Postgres jobs table claimed with SKIP LOCKED, with retries on declared retryable errors only, idempotency keys, per-key single-flight and an internal tick endpoint because there is no scheduler yet."
related_docs:
  - "0032-inbox-items-approvals-and-run-resume.md"
  - "0036-credential-vault-kms-and-key-hierarchy.md"
  - "../api-spec/connections_endpoints.md"
adr_id: "0038"
decision_status: "Accepted"
supersedes: []
---

# ADR-0038: Postgres-backed durable job runner

## Status

Accepted (2026-10-23). Founder delegated: backlog item X-10 and decision D-M2-3 name the recommended option (Postgres-backed in each runtime, unique keys for exactly-once) and the Founder delegated acceptance to WP-M2-02. The full spike (kill-the-process tests per property, comparison with DBOS, Temporal, Hatchet, pg-boss, BullMQ, Celery beat) is not run here: the candidate list is recalled and unverified, and only the properties the platform needs today were tested (see Evidence). The sineva-ai run engine of M3 follows the same semantics in its own runtime. Unblocks WP-M2-15, later WP-M2-16.

## Context

Refreshing tokens, probing connection health and reconciling after a restore cannot run in Next.js request handlers: there is no scheduler there and a lost refresh can lock a rotating-refresh provider out. Redis-only queues lose jobs on restart. Postgres is already the system of record.

## Decision

1. **A `jobs` table** (schema `platform`): `job_type`, `payload` (ids only, never secrets), `status` (`queued`, `running`, `succeeded`, `failed`, `cancelled`), `run_at`, `attempts`, `max_attempts`, `idempotency_key`, `concurrency_key`, lease columns (`locked_by`, `lease_expires_at`), `last_error_code`, optional `workspace_id`, timestamps.
2. **Claim with `FOR UPDATE SKIP LOCKED`** in one statement that moves the oldest due job to `running`, increments `attempts` and sets a lease. Two workers never get the same job.
3. **Idempotency.** Unique `(job_type, idempotency_key)` where the key is set: enqueuing the same key twice returns the first job. Refresh jobs use `connection:<id>:<expires_at>`, so a scheduler tick that runs twice makes one job.
4. **Single-flight.** A partial unique index on `concurrency_key` where `status = 'running'` allows one running job per key; a claim that loses the race skips to the next candidate. Refresh uses the connection id as key.
5. **Retry policy.** Only errors a handler marks retryable (`RetryableJobError`: network, 5xx, lock contention) are retried, with exponential backoff (base 5 s, factor 2, cap 15 min) and plus or minus 25 percent jitter, up to `max_attempts`. Any other error fails the job at once (for example `invalid_grant`); the failure stores a code, never a message.
6. **Crash recovery.** A running job whose lease expired is returned to `queued` by the next tick. Handlers must be idempotent.
7. **Trigger.** `POST /internal/v1/jobs/tick` (`X-Internal-Api-Key`) runs registered planners (enqueue what is due), reaps expired leases and then drains up to a bounded number of ready jobs. A scheduler (cron, a platform worker later) calls it every minute. `GET /internal/v1/jobs/stats` reports queue depth, oldest due age and failed counts from the table, so health is the queue itself.
8. **Port.** Application code depends on a `JobQueue` port (`enqueue`, `claim`, `complete`, `fail`, `reapExpired`, `stats`); the Prisma adapter lives in infrastructure and an in-memory fake obeys the same contract suite.
9. **Logging** goes through the allowlisted logger with new events; no payloads.

## Evidence

Recalling, not verified: `SELECT ... FOR UPDATE SKIP LOCKED` is documented in the PostgreSQL SELECT reference (locking clause) as intended for queue-like tables. Inference: with one claim statement per job and a partial unique index, the single-flight and exactly-once-enqueue properties hold under concurrent workers; the integration suite asserts both with parallel claimers. Not tested here: process-kill resume in CI nightly (needs a worker entrypoint and compose service, follow-up).

## Consequences

- The tick endpoint is the scheduler until a worker process exists; if nobody calls it, nothing refreshes. Operations must schedule it.
- Throughput is bounded by one Postgres; fine for the expected refresh volume (hundreds of connections), revisit at scale or when M3 needs per-step records.
- A handler that succeeds but crashes before `complete` runs again after the lease: handlers must be idempotent.

## Alternatives considered

- **pg-boss or BullMQ.** Extra dependency and, for BullMQ, Redis persistence that this work must not rely on. Candidates were not verified here.
- **Temporal.** Strong guarantees, new infrastructure; revisit if scale demands (plan default).
- **Cron calling use cases directly.** No retries, no single-flight, no record of failures.
