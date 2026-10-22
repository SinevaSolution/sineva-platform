---
title: "Business Profile, Onboarding State and Website Scan"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-22"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "onboarding", "business-profile", "profile-pack", "scan", "ssrf"]
summary: "A new account gets its first workspace through POST /api/v1/me/first-workspace, onboarding state is one resumable row per member, the Business Profile is versioned with confirmed-only fields, the profile pack is a token-capped projection, and the website scan runs in sineva-ai behind a platform port with a proposed contract."
related_docs:
  - "README.md"
  - "0015-sineva-ai-owns-internal-chat-contract.md"
  - "0016-upstream-failures-return-502-503.md"
  - "0018-workspace-tenancy-and-public-contract.md"
  - "0019-role-and-permission-model.md"
  - "0021-signed-internal-context.md"
  - "../../docs/implementation-plan/M1-chat-core.md"
adr_id: "0031"
decision_status: "accepted"
supersedes: []
---

# 0031 Business Profile, Onboarding State and Website Scan

Accepted on the Founder's delegation, using the implementation plan's recommended option for WP-M1-35 and WP-M1-36 (PRD ADRs 2 and 3 of "Onboarding, Business Profile & Memory"). Evidence labels: **official** means read from the PRD, the plan or the repo, **inference** means derived from them, **proposed** means pending sineva-ai.

## Context

A person who signs up has an account and no workspace, so every workspace route answers 404 and the root page is a dead end. The PRD (FR-ONB-01) assumes a provisional workspace already exists. The Business Profile needs versions, confirm-before-use fields and a compact pack for the runtime. The website scan runs in sineva-ai (WP-M1-10), whose contract does not exist yet, so the platform must build against a proposal.

## Decision

1. **First workspace.** `POST /api/v1/me/first-workspace` (user scope, global path because no workspace exists yet) creates the provisional workspace ("My workspace" / "Workspace saya", slug `my-workspace-<6 hex>`) through the existing `CreateWorkspaceUseCase`, so the `workspaces.owned.max` entitlement check, owner membership and `workspace.created` audit row come for free. It refuses with 409 when the user already belongs to a workspace (`already_has_workspace`) or holds a pending, unexpired invitation (`invited_user`; invited people join through the invitation). It also needs a verified email. It creates the owner's `onboarding_states` row and writes `onboarding.started` in the same transaction. Concurrent double submits are not serialized by a database constraint (no unique "one workspace per owner" rule exists, and plans will allow several); the client page submits once and treats 409 as "go to your workspace".
2. **Onboarding state** is one row per `(workspace_id, user_id)`: `status` (`in_progress | completed | abandoned`), `current_step`, `answers` (jsonb, validated per step), `skipped_steps`, `dismissed_tasks`. `GET` never writes (it returns defaults with `persisted: false`); the first `PATCH` creates the row and audits `onboarding.started`. Owners run the five-step flow (`onboarding.run`); every other role gets the two-step member welcome. Language (step 1) and business name (step 2) cannot be skipped.
3. **Provisional rename.** Step 2 renames the workspace and regenerates the slug **once** through `UpdateWorkspaceUseCase` with a `provisional_slug` option that skips the "customized once" rule and does not set `slug_changed_at`, so the owner's one deliberate custom slug (FR-SHELL-13) is not spent by onboarding. The once is tracked in `answers.slug_regenerated`.
4. **Business Profile.** Tables `business_profiles` (one per workspace), `business_offerings`, `business_policies`, `business_profile_versions`. A field counts as confirmed when its `field_meta` entry carries `confirmed_at`; a `PUT` is the owner's act of confirming, so every non-empty field it carries is stamped, an empty value removes the entry and stays empty, and unconfirmed scan suggestions are never persisted (they live only in `profile_scans.result`, which expires). Every save (profile, offering, policy, restore) writes a version with author, timestamp and the changed paths; restore writes a new version and never rewrites history. Optimistic concurrency through optional `base_version` plus `UNIQUE (workspace_id, version)`. Offers are capped at 50; prices are integer IDR in `bigint` (conventions section 2 wins over the PRD's `numeric`; other currencies are out of scope for v1.0); a price exists only when the user typed it, and the scan contract carries no price.
5. **Permission keys.** The PRD names `profile.view` and `profile.update`, but those keys already exist for the person's own profile (`/api/v1/me`, every role may edit). Reusing them would let a viewer edit the business. The business keys are therefore `business_profile.view` (all roles), `business_profile.update` (owner, admin), `business_profile.scan` (owner, admin) and `onboarding.run` (owner). Restore needs `business_profile.update`.
6. **Guardrails above the profile** (FR-ONB-19, 20). Text is length-capped. Writes return `warnings` (`instruction_like`, `special_category`) from a conservative EN/ID heuristic and still save: it warns the owner and nothing executes. National ID numbers (NIK) in free text are rejected (422 `sensitive_identifier`), since the profile is business data and an ID number is never needed.
7. **Profile pack.** A pure projection, `buildProfilePack`, over the confirmed values only: identity, voice, policies, offers, voice samples, in that priority. Cap 2,000 tokens, estimated as `ceil(characters / 4)` of the JSON (a heuristic, not a tokenizer; sineva-ai caps again). An item that does not fit is omitted whole and the pack carries `truncated: true` with the omitted counts: a policy is never cut in the middle, because half a return policy is worse than none. The signed context gains an optional additive claim `profile_version`. Sending the pack and reading the claim is the sineva-ai half (WP-M1-09), so the pack is not yet attached to chat requests.
8. **Website scan** (**proposed** contract, pending sineva-ai; fixtures `scan_*.json` in `src/__tests__/contract/fixtures/`).
   - Upstream: `POST {ai}/internal/v1/profile/scan` (path from WP-M1-10) with `X-Internal-Api-Key`, `X-Sineva-Context`, `X-Request-Id`, `traceparent`. Body `{ "source_url", "locale", "scan_id" }`. 200 envelope `{ "success": true, "data": { scan_id, status: succeeded | partial | failed, source_url, final_url, fetched_pages, site_language, fields, offers, policies, error_code } }`. Every extracted value carries `source_url` and `evidence_snippet`; a field without evidence is absent. A scan that ran and found nothing readable is a 200 with `status: failed` and a typed `error_code`; transport and contract problems are HTTP errors (ADR-0016).
   - The call is **synchronous** (sineva-ai caps total time at 20 s, FR-ONB-10; the platform allows 25 s). The platform writes the record first, calls, then stores the result. If sineva-ai is unreachable the record is marked failed (`ai_engine_unavailable`) and the route answers a typed 503; a bad answer is 502 with `ai_engine_bad_response`. Onboarding never depends on a scan: the manual path stays open.
   - Rate limit: 5 scans per workspace per rolling hour, enforced in the database under a per-workspace advisory lock so concurrent requests cannot overshoot. Deleted rows still count (deleting must not reset the quota), and a scan that never reached sineva-ai does not count. Results expire 24 hours after the request; expired rows are blanked opportunistically on the next request and read as 404.
   - The platform pre-validates the URL (http or https, no credentials, no IP literal in private, loopback, link-local or metadata ranges, no `localhost` or internal suffixes). This is defense in depth and a fast 422; the authoritative SSRF control is sineva-ai's post-DNS check (WP-M1-10). Instagram and marketplace hosts are refused with 422 `unsupported_scan_source`: those inputs are stored as links and handles only (FR-ONB-13).
9. **Checklist** (`workspace_checklist_state`): items complete from events. `confirm_profile` is recorded when the profile is confirmed, `invite_teammate` is derived from an accepted invitation on read, and `add_library_documents` is recorded by the Library when a document becomes Ready (no caller exists until the Library ships).
10. **First tasks** come from a typed in-code catalog per business type and goal with both locales (three business types at launch, everything else uses the generic set), always exactly three; a task dismissed in the last 7 days is skipped and only re-offered, oldest first, when the pool would otherwise fall below three.

## Consequences

- One migration: `business_profiles`, `business_offerings`, `business_policies`, `business_profile_versions`, `onboarding_states`, `profile_scans`, `workspace_checklist_state`.
- `UpdateWorkspaceUseCase` gains one optional input (`provisional_slug`).
- The scan contract is a proposal. If sineva-ai answers differently, only the adapter, its Zod schema and the fixtures change; the port, use cases and routes do not.
- A scan holds one HTTP request open for up to 25 s. There is no cancel of the upstream call; "cancel" in the UI aborts the browser request and discards the result.
- The pack is not attached to chat requests until sineva-ai defines the field (WP-M1-09); "Preview my voice" is blocked on the same contract.

## Alternatives considered

- **Asynchronous scan with polling** (queued, then a background task): rejected for now. The only background mechanism is an in-process promise that loses work on restart; the durable runner arrives with ADR-X-10. The synchronous call is honest and replaceable behind the same port.
- **Redis sliding-window rate limit**: rejected. A Redis outage would either block scans or silently disable the limit, and the database count is already transactional.
- **Reuse `profile.update` for the business profile**: rejected, see decision 5.
- **Create the first workspace inside sign-up**: rejected. Invited users must not get a workspace, and sign-up has no knowledge of invitations; a separate explicit call keeps both flows simple.
