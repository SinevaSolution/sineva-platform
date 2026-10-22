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
