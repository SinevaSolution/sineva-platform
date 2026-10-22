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
