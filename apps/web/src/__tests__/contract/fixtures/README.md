# sineva-ai contract fixtures

`chat_request.json` and `chat_response_envelope.json` are owned by `sineva-ai`
(`sineva-ai/tests/contract/fixtures/`). They are copied here byte-for-byte and
drive `../internal_ai_engine_gateway.contract.test.ts`.

Do not edit these copies. When the `sineva-ai` DTOs or response envelope change,
update the fixtures there first, then copy them here in the same change so the
platform gateway and its tests move together.

`chat_request.json` includes `tenant_id`; the platform gateway does not send it
yet (the public chat request has no workspace), so the request test compares
against the fixture without that key.

## approval_*.json: proposed by the platform, pending sineva-ai

The files named `approval_*.json` are not copies. They do not exist in
`sineva-ai/tests/contract/fixtures/` yet: the platform proposed them for
WP-M1-40 (ADR-0032) and sineva-ai must accept or change them in WP-M1-07
before the byte-identical rule applies. Until then they pin the platform's
side only, in `../approval_contract.test.ts`.

- `approval_required_event.json` and `approval_input_required_event.json`:
  the `data` of the SSE events `approval_required` and `input_required`.
- `approval_create_request.json` and `approval_input_create_request.json`:
  bodies sineva-ai posts to `POST /internal/v1/approvals` and
  `POST /internal/v1/input-requests` (adds `workspace_id` and the platform run
  handle `run_id`).
- `approval_resume_request_*.json` and `approval_input_resume_request_*.json`:
  bodies the platform sends to `POST /api/v2/runs/{run_id}/resume`.
## Library fixtures (`library_*.json`): proposed by the platform, pending sineva-ai

These are not copies. The platform wrote them (platform ADR-0030, WP-M1-32) as a
proposal for the Library ingest contract, because the Library work in
`sineva-ai` (WP-M1-11 to 13) has not started. Until `sineva-ai` accepts them or
sends changes, they are the platform's source of truth, and the platform tests
(`../internal_knowledge_gateway.contract.test.ts`, the Library use-case tests)
run against them through a fake upstream.

When `sineva-ai` owns the contract, move these files to
`sineva-ai/tests/contract/fixtures/`, copy them back byte for byte and delete
this section; from then on the rule above applies and the copies here are never
edited.

| File | Direction | Call |
| :--- | :--- | :--- |
| `library_ingest_request.json`, `library_ingest_accepted.json` | platform to sineva-ai | `POST /api/v1/knowledge/documents` (202) |
| `library_ingest_status.json`, `library_ingest_status_needs_attention.json` | platform to sineva-ai | `GET /api/v1/knowledge/ingest/{job_id}?tenant_id=` |
| `library_reindex_request.json` | platform to sineva-ai | `POST /api/v1/knowledge/documents/{document_id}/reindex` (answer as accepted) |
| `library_acl_update_request.json`, `library_acl_update_response.json` | platform to sineva-ai | `PUT /api/v1/knowledge/documents/{document_id}/acl` |
| `library_delete_response.json`, `library_delete_response_stray_vector.json` | platform to sineva-ai | `DELETE /api/v1/knowledge/documents/{document_id}?tenant_id=` |
| `library_search_request.json`, `library_search_response.json`, `library_search_response_abstained.json` | platform to sineva-ai | `POST /api/v1/knowledge/search` |
| `library_text_preview_response.json` | platform to sineva-ai | `GET /api/v1/knowledge/documents/{document_id}/text?tenant_id=&page_from=&page_to=` |
| `library_ingest_event_*.json` | sineva-ai to platform | `POST /api/internal/v1/library/ingest-events` (internal key only) |
| `library_error_context_mismatch.json` | sineva-ai to platform | error envelope of any call |

Rules the fixtures encode: every call carries `X-Internal-Api-Key`; user-started
calls also carry `X-Sineva-Context` and `tenant_id` must equal the context's
tenant; the platform chooses `job_id`; events carry a per-job `sequence` and an
`event_id` for idempotency; no similarity score appears anywhere; the delete
answer must report `vectors_remaining` and `verified`.

## `scan_*.json`: proposed by the platform, pending sineva-ai

`scan_request.json`, `scan_result.json`, `scan_result_partial.json` and
`scan_result_failed.json` are the website scan contract (sineva-ai WP-M1-10,
platform WP-M1-36, ADR-0031). Unlike every file above they are **not** copies:
sineva-ai has not defined this contract yet, so the platform wrote these as a
proposal and builds its gateway and `scan_gateway.contract.test.ts` against
them. When sineva-ai ships its own fixtures, replace these files with the
byte-identical copies, adjust the adapter schema if the shape differs, and
delete this section. Until then they are the only files here the platform may
edit.

The call is `POST /internal/v1/profile/scan` with `X-Internal-Api-Key`,
`X-Sineva-Context`, `X-Request-Id` and `traceparent`. A scan that ran but could
not read the page is HTTP 200 with `status: "failed"` and a typed `error_code`;
an unreachable or failing sineva-ai is an HTTP error (platform ADR-0016).

## `workflow_*.json`: proposed by the platform, pending sineva-ai

The run contract v2.1 for Workflows (platform ADR-0046, WP-M3-02 and WP-M3-04 on
the platform side). They are **not** copies: sineva-ai has not built the durable
engine, so the platform wrote these as a proposal and tests its gateway, event
intake and run screens against them through a fake upstream
(`../workflow_run_gateway.contract.test.ts`). When sineva-ai accepts or
changes them, move the files to `sineva-ai/tests/contract/fixtures/`, copy them
back byte for byte and delete this section. Until then they are the only files
here the platform may edit (besides this README).

| File | Direction | Call |
| :--- | :--- | :--- |
| `workflow_run_request_test.json`, `workflow_run_request_live.json` | platform to sineva-ai | `POST /api/v2/runs` (body; tenant and user come from `X-Sineva-Context`) |
| `workflow_run_accepted.json` | sineva-ai to platform | answer of the start call (202) |
| `workflow_run_snapshot_*.json` | sineva-ai to platform | `GET /api/v2/runs/{run_id}`: needs review, succeeded, failed step, budget exceeded |
| `workflow_run_cancel_response.json` | sineva-ai to platform | `POST /api/v2/runs/{run_id}/cancel` |
| `workflow_run_resume_request.json`, `workflow_run_resume_response.json` | both | `POST /api/v2/runs/{run_id}/resume` (`from_failed_step` or `continue_after_budget`, with an `Idempotency-Key`) |
| `workflow_run_event_*.json` | sineva-ai to platform | `POST /api/internal/v1/workflow-runs/events` (internal key only): `run_status`, `step_started`, `step_completed` |
| `workflow_run_events_transcript_review.json` | sineva-ai to platform | one run in order, replayed by the screen reducer test |

Rules the fixtures encode: the platform chooses `run_id` (its `engine_run_id`);
the body carries a definition snapshot, never a reference to a draft; no
`tenant_id` or `user_id` in the request body; every pushed event has a per-run
`sequence` (applied only when higher than the stored one) and an `event_id` for
idempotency; the run status set is `queued`, `running`, `waiting`,
`needs_review`, `succeeded`, `failed`, `cancelled`, `budget_exceeded`; the step
status set is `waiting`, `running`, `needs_review`, `done`, `failed`, `skipped`.
