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
