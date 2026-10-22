---
title: "Connections Runbook"
category: "deployment"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "deployment", "runbook", "connections", "vault", "jobs"]
summary: "What an operator does for the connection layer: schedule the job tick, create the vault database roles, rotate the vault key, sweep after a restore, revoke a provider after an incident."
related_docs:
  - "environment_variables.md"
  - "../decisions/0036-credential-vault-kms-and-key-hierarchy.md"
  - "../decisions/0038-durable-job-runner.md"
  - "../api-spec/connections_endpoints.md"
---

# Connections runbook

Operator steps for Connected tools (ADR-0036 to ADR-0039). Every command below requires `X-Internal-Api-Key`; the job tick also accepts the cron bearer described below. `$APP` is the platform base URL and `$KEY` the internal API key. Use the `/api/internal/v1/...` paths on public HTTPS hosts so the page guard does not redirect the request to sign-in.

## 1. Schedule the job tick (required)

Vercel Production schedules the job tick every minute through `apps/web/vercel.json`. Set `CRON_SECRET`; Vercel calls `GET /api/internal/v1/jobs/tick` with `Authorization: Bearer $CRON_SECRET`. The current schedule requires Pro ([Vercel guide](vercel.md)). Preview deployments do not run these cron jobs.

For Docker or another host, configure a scheduler to call the tick about once a minute. Without it, token refresh, connection probes and rotation reminders do not run. A manual call uses:

```bash
curl -fsS -X POST "$APP/api/internal/v1/jobs/tick" -H "X-Internal-Api-Key: $KEY"
```

The answer is `{ planned, reaped, ran, succeeded, retried, failed, planner_errors }`. A non-zero `planner_errors` means a planner threw (see the `job.failed` log lines whose type starts with `planner:`). Queue health:

```bash
curl -fsS "$APP/api/internal/v1/jobs/stats" -H "X-Internal-Api-Key: $KEY"
```

Alarm on `oldest_due_seconds` above a few minutes (the tick is not running or cannot keep up) and on `failed` growing. A failed `connection.refresh` job with `last_error_code = invalid_grant` is normal: it is a person who has to reconnect, not an outage.

## 2. Vault database roles (once per environment)

The application database role must not read `platform.vault_secrets`. After the migration `vault_and_connections` is deployed, run the operator script with a superuser URL (never on a developer database, and never as a Prisma migration):

```bash
psql "$ADMIN_DATABASE_URL" -v app_role=sineva_app -v vault_role=sineva_vault -v owner_role=sineva_migrator \
  -f apps/web/prisma/ops/vault_roles.sql
```

Create the three roles first, with passwords from the secret store. `owner_role` must differ from `app_role` (a table owner keeps its privileges). Set `VAULT_DATABASE_URL` to the vault role's URL and `VAULT_LOCAL_KEK` to a production key (`<kek_id>:<base64 of 32 random bytes>`, an id without `dev`, `example` or `changeme` in it). Production refuses to start with a development key and, when the vault is first used, without `VAULT_DATABASE_URL`. Re-run the script after any migration that touches the table.

Check: as the app role, `SELECT * FROM platform.vault_secrets` must answer `permission denied`.

## 3. Rotate the vault key (yearly, or after an incident)

1. Generate a new key with a new id: `echo "prod-2027:$(openssl rand -base64 32)"`.
2. Set `VAULT_LOCAL_KEK` to it and `VAULT_LOCAL_KEK_PREVIOUS` to the old value, then roll the app out.
3. Rewrap in batches until done:

```bash
curl -fsS -X POST "$APP/api/internal/v1/vault/rotate-keys" -H "X-Internal-Api-Key: $KEY" \
  -H "Content-Type: application/json" -d '{"limit":200}'
```

Repeat while `more` is true. `failed` must end at 0: a failed row is wrapped by a key this process does not hold (an older key that was already dropped). `skipped` rows were written meanwhile and are caught by the next call.
4. Remove `VAULT_LOCAL_KEK_PREVIOUS` and roll out again. Ciphertext was never touched, so no secret changes.

## 4. Sweep after a database restore

A restore can bring back connections that were revoked or whose refresh tokens rotated since the backup. Queue the sweep:

```bash
curl -fsS -X POST "$APP/api/internal/v1/connections/reconcile" -H "X-Internal-Api-Key: $KEY"
```

It answers 202 with a job id. Each batch queues the next and every connection gets one health job; the ones the provider rejects become `needs_reconnect`, and their owners get an Inbox item and an email. The tick must be running. A restore also resurrects revoked ciphertext: until the sweep has run, treat connections as unverified.

## 5. Revoke a provider after an incident

A provider breach or a leaked OAuth client secret: take every connection of that provider away, in every workspace.

```bash
curl -fsS -X POST "$APP/api/internal/v1/connections/mass-revoke" -H "X-Internal-Api-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"google_calendar","confirm":"revoke-all:google_calendar","limit":100}'
```

Repeat while `more` is true. Each connection is revoked at the provider (best effort), its secret erased, its row tombstoned and `connection.revoked` audited with `reason: mass_revoke`. Afterwards rotate the provider's OAuth client secret in its console and in `*_CLIENT_SECRET`. This cannot be undone: people must connect again.

## 6. Known gaps

- Rate limits on the connection routes and the OAuth callback (WP-M2-07) are not built; rely on the edge limits until then.
- The platform Tool Gateway now enforces grants and executes Gmail actions after review. The runtime consumer and selected-skill scope admission are not wired (WP-M2-11), so current chat calls cannot use it. See [the gateway contract](../api-spec/tool_gateway_endpoints.md).
- Provider parameters marked "recalled" in the manifests (Google offline access and consent, Notion token behavior, Xendit and Midtrans test calls, key prefixes in the redaction list) must be checked against provider documentation before each provider goes live in an environment (OQ-CONN-8).
- The production KMS is not chosen (D-M2-2): the local adapter keeps the key in process memory.


## 7. Tool Gateway kill switches

The gateway reads these switches on every call. The M2 default (D-M2-4) provides an operator script; Owner/Admin UI is M3 work. Use an administrative database role and print only its host and database before the command. Never pass the database password in a log.

```bash
psql "$ADMIN_DATABASE_URL" -v scope=provider -v target=gmail -v enabled=true -v actor=operator-id \
  -f apps/web/prisma/ops/tool_gateway_kill_switch.sql
```

Use `enabled=false` to lift it. Replace `operator-id` with the operator's audit identifier. The script changes the switch and appends `security.kill_switch_changed` in one transaction.

| Scope | Target | Stops |
| :--- | :--- | :--- |
| `provider` | `gmail` (or another provider ID), `*` for all | Tool calls to that provider across workspaces |
| `freeze` | workspace UUID, `*` for all | Reads and writes |
| `read_only` | workspace UUID, `*` for all | Writes only |
| `specialist` | specialist slug globally, `workspace-uuid:slug` in one workspace, or `*` | That specialist's tool calls |

For a provider incident also use the mass-revoke procedure in section 5. The switch blocks gateway actions; OAuth refresh/revocation jobs remain separate operations.

### Uncertain sends and resume failures

An external write whose transport timed out or whose result could not be confirmed is never retried automatically. A call left executing for more than 120 seconds also reports `tool_outcome_unknown`. Check the sender's Gmail Sent folder and the platform call ledger before requesting another review. Do not delete the reservation or reset it to executing to force a resend.

The call ledger records correlation IDs, hashes, authorization scope and redacted results. The Inbox holds the sealed email payload. Give neither to application logs. If provider execution succeeded but runtime resume failed, retrying the same decision reuses the stored result and only retries resume. A prolonged resume outage has no durable outbox yet; reconcile a pending or expired Inbox item against the ledger before starting a new action.

Two additive migrations introduce this layer: `20261023133000_tool_gateway_calls_and_kill_switches`, then `20261023134000_tool_gateway_approval_binding`. Apply through the normal reviewed release path. They were tested on a disposable database, not deployed to the persistent local database by this change.
