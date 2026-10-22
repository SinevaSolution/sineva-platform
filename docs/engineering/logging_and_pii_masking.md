---
title: "Logging and PII Masking"
category: "engineering"
status: "active"
version: "1.0.0"
last_updated: "2026-10-22"
owner: "Sineva Engineering"
tags: ["sineva", "logging", "pii", "masking", "nik", "npwp", "security", "fr-sec-19", "fr-sec-20"]
summary: "How server code logs (one wrapper, fixed events, allowlisted fields), how Indonesian identifiers and secrets are detected and masked, the shared test vectors, and the lint rule that blocks content logging."
related_docs:
  - "error_handling_and_failure_modes.md"
  - "testing_strategy.md"
  - "../development/known_issues_and_tech_debt.md"
  - "../governance/agent_rules.md"
---

# Logging and PII masking

Logs hold no content. They carry a fixed event name and a short list of metadata fields. Free-text fields that remain are masked. Business answers shown to the owner are never masked: the masker is for logs, traces, evals and support views only.

## 1. The logger wrapper

`apps/web/src/server/infrastructure/logging/logger.ts` is the only code in `src/server` and `src/app/api` that may write to the console.

```ts
logger.error('ai_engine.non_2xx', { status, byte_length: utf8ByteLength(rawBody) });
```

- **Event**: one of `LOG_EVENTS` (a fixed list). Free text does not compile. Add a member to the list before you log a new kind of event.
- **Fields**: `LogFields` is the allowlist: `status`, `code`, `byte_length`, `latency_ms`, `request_id`, `aborted`, `reason`, `agent_slug`, `issue_paths`. A key is allowed only if it is a status, code, size, timing, flag or opaque resource id. Never content, never the id of a person (`user_id` is not allowed).
- **Runtime backstop**: a key outside the allowlist, or a value of the wrong type, is dropped and counted in `dropped_fields`. A nonzero count in production means a caller tried to log something the policy forbids.
- **Masking and size**: string fields are cut to 200 characters and then passed through `mask()`.
- **Output**: one JSON line per call on `console.error`, `console.warn` or `console.info`.

Why an allowlist and not "log anything, then mask": the masker knows identifier and secret patterns only. A reply or a prompt holds personal data with no pattern (names, addresses, business details), so masking cannot make content safe to log.

## 2. Lint

`apps/web/eslint.config.mjs` applies to `src/server/**` and `src/app/api/**`:

- `console.*` and `process.stdout` or `process.stderr` writes are errors.
- A content-like key (`body`, `*_body`, `prompt`, `*_prompt`, `reply`, `reply_*`, `user_message`, `message_text`, `messages`, `payload`, `*_payload`, `tool_args`, `arguments`, `content`, `request`, `response`) inside a `logger.error|warn|info(...)` call is an error. The key list is a heuristic; the `LogFields` type is the contract.
- The logging folder is exempt.

`src/__tests__/log_hygiene_lint.test.ts` runs the real config over fixtures, so removing or loosening a rule fails a test.

## 3. Detectors and `mask()`

`packages/shared/src/pii/` (exported from `@sineva/shared`):

- `detectPii(text)` returns non-overlapping `{ kind, start, end }` spans. `mask(text)` replaces them with fixed placeholders: `[NIK]`, `[NPWP]`, `[PHONE]`, `[BANK_ACCOUNT]`, `[EMAIL]`, `[SECRET]`. Placeholders have no digits, so `mask` is idempotent.
- Overlap priority: secret, email, NPWP, NIK, bank account, phone.
- Rules and their limits are listed in `packages/shared/src/pii/vectors/README.md`.

Gotchas:

- NIK without a keyword is masked only when the structure is plausible (province, birth day with the female +40 offset, month, non-zero serial). A 16 digit order number that happens to be structurally valid is masked anyway. That is the safe direction.
- Phone covers Indonesian mobile numbers only. Landlines are not detected.
- Plain NPWP and bank account numbers need a keyword in the 5 or 20 characters before them. Without it they are indistinguishable from other numbers and are not masked.
- Patterns are length-bounded. An unbounded character class rescans from every start position and is quadratic on a long run of digits or address characters; `pii.test.ts` has timing guards for this.
- Trace and eval writers must call `mask` before writing. They do not exist yet; the hook is the exported function.

## 3a. Credential redaction list

Credential shapes (provider keys, token endpoint bodies, OAuth `code` and `state` in callback URLs, Basic credentials, Telegram tokens in URL paths, webhook signatures) are data in `packages/shared/src/redaction/redaction_patterns.json`, not code. `detectPii` and `mask` load the list, so the logger and every other caller of `mask` pick a new pattern up with no code change; each pattern reports its id through `scanForSecrets(text)` (`containsSecret(text)` for output lint). Rules:

- A pattern needs at least one positive row (the exact credential that must be masked) and one negative row (ordinary text that must stay unchanged) in the same entry. `redaction.test.ts` walks the data, so a pattern without rows fails.
- `provenance` says `documented` or `recalled`. A recalled prefix (Xendit, Midtrans, Notion, several model providers) must be checked against the provider's documentation before it is relied on (OQ-CONN-8, OQ-MDL-10).
- Audit rows get the same masking on every string leaf of `metadata` and `change` (`RepositoryAuditLogger`), on top of the key-name redaction in the domain, so a token stored under an innocent key like `note` does not reach the table.
- `src/__tests__/secret_canary_scan.test.ts` is the token scan (plan gate G1): it seeds credential-shaped canaries into the logger, error handler, job runner, vault and audit logger and searches every capture for the marker. Later flows add cases through `helpers/canary_secrets.ts`. It runs in `npm run test`, so it blocks merge in CI.
- The reply-side check (FR-SEC-10) is `containsSecret(reply)`; it is not wired into the chat path yet.
- `sineva-ai` must copy `redaction_patterns.json` byte for byte for its log and trace writers; no drift test exists yet because that repo has no copy.

## 4. Test vectors and the sineva-ai copy

`packages/shared/src/pii/vectors/pii_vectors.json` is shared with `sineva-ai`, whose filter must pass the same cases. `sineva-ai` must copy it byte for byte; `vectors_drift.test.ts` compares the two once the copy exists and is visibly skipped until then. Details and the lookup path are in `vectors/README.md`.
