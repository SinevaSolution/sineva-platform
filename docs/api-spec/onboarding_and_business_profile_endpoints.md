---
title: 'Onboarding and Business Profile Endpoints'
category: 'api-spec'
status: 'active'
version: '1.0.0'
last_updated: '2026-10-22'
owner: 'Sineva Engineering'
tags: ['sineva', 'onboarding', 'business-profile', 'scan']
summary: 'Resumable onboarding, the first workspace, confirmed Business Profile fields, version history and website scan proposals.'
related_docs:
  - 'overview.md'
  - '../decisions/0031-business-profile-onboarding-and-website-scan.md'
---

# Onboarding and Business Profile endpoints

All workspace paths below start with `/api/v1/workspaces/{workspace_id}`. Identity comes from the session; workspace membership is checked before the use case runs. Cross-workspace access returns 404. JSON uses the standard envelope with `meta.request_id` and the matching `X-Request-Id` header. Bodies reject unknown keys.

## First workspace

`POST /api/v1/me/first-workspace` takes no body and returns 201 `{ workspace, onboarding }`. The account must have a verified email. Existing members receive 409 `already_has_workspace`; accounts with an unexpired invitation receive 409 `invited_user` and must accept that invitation. Creation checks `workspaces.owned.max`, creates the owner membership and records `workspace.created` and `onboarding.started` transactionally.

## Onboarding

| Method | Suffix                                      | Result                                                                         | Permission           |
| :----- | :------------------------------------------ | :----------------------------------------------------------------------------- | :------------------- |
| GET    | `/onboarding`                               | `{ onboarding, checklist }`; a read never creates a row                        | Any member           |
| PATCH  | `/onboarding`                               | `{ onboarding, workspace }`                                                    | Any member, own flow |
| POST   | `/onboarding/complete`                      | Confirmed profile, offerings, policies, onboarding state, version and warnings | Owner                |
| GET    | `/onboarding/first-tasks?locale=en`         | `{ tasks }`, exactly three localized suggestions                               | Any member           |
| POST   | `/onboarding/first-tasks/{task_id}/dismiss` | Updated dismissal list                                                         | Any member, own list |

PATCH accepts `{ step, action: "save" | "skip", answers? }`. Owners have five steps; other roles have two. Step-specific answer keys:

1. `language` (`en` or `id`) and optional `about_you` (preferred name, salutation, job title, department, phone). Cannot be skipped.
2. Owner: required `business_name`, `business_type` (`online_shop`, `food_beverage`, `services_agency`, `retail_store`, `manufacturing`, `other`), optional team size, city and province. Cannot be skipped. The provisional workspace name and slug change here, so clients must navigate using the returned workspace slug. Member: welcome completion.
3. Optional `website_url`, `instagram_handle`, `marketplace_url`. Handles and marketplace links are stored as links only.
4. Up to three `goals`: `faster_replies`, `organize_finances`, `create_content`, `find_customers`, `manage_staff`, `tax_admin`, `understand_numbers`.
5. Review; no step answers. Owner confirms through `/complete` with optional `profile`, `field_sources`, `scan_id`, `offerings`, `policies`.

Completed values from the owner's answers become the profile's base. Only explicitly submitted scan suggestions are confirmed. Member flow completion is recorded through PATCH step 2. Checklist completion comes from stored events or an accepted invitation. Task dismissal lasts seven days.

## Business Profile

| Method        | Suffix                                | Result                                                    | Permission                              |
| :------------ | :------------------------------------ | :-------------------------------------------------------- | :-------------------------------------- |
| GET           | `/profile`                            | `{ profile, offerings, policies }`, version 0 when absent | `business_profile.view` (all roles)     |
| PUT           | `/profile`                            | Saved profile result, version, warnings                   | `business_profile.update` (owner/admin) |
| GET           | `/profile/pack`                       | Confirmed-only pack, maximum 2000 estimated tokens        | `business_profile.view`                 |
| GET           | `/profile/versions?limit=20&before=5` | Version list, newest first                                | `business_profile.update`               |
| GET           | `/profile/versions/{version}`         | Historical snapshot                                       | `business_profile.update`               |
| POST          | `/profile/versions/{version}/restore` | New version restored from the snapshot                    | `business_profile.update`               |
| GET, POST     | `/profile/offerings`                  | List / create (201)                                       | view / update                           |
| PATCH, DELETE | `/profile/offerings/{offering_id}`    | Updated entry / new profile version                       | update                                  |
| GET, POST     | `/profile/policies`                   | List / create (201)                                       | view / update                           |
| PATCH, DELETE | `/profile/policies/{policy_id}`       | Updated entry / new profile version                       | update                                  |

PUT supports display/legal name, industry, city, province, languages, website, social handles, business hours, brand voice, audience and goals. Omitted fields stay unchanged; null clears them. Optional `base_version` rejects stale edits with 409. `field_sources` records `user` or `website`; website provenance requires the corresponding `scan_id`. A save confirms the submitted values and writes a new immutable version. Restore creates a new version.

Offerings have a required name, optional description, URL, confirmed flag and integer IDR price. Prices exist only when entered by the owner, with a cap of 50 offerings. Policies have kind (`returns`, `shipping`, `payment`, `hours`, `faq`, `other`), title, body and confirmation state. Text guards reject national identifiers with 422 and return warnings for instruction-like or special-category text. Warning text never executes.

## Website scans

`POST /profile/scans` accepts `{ source_url, locale? }` and returns 201 `{ scan }`. GET and DELETE `/profile/scans/{scan_id}` read or discard the result. Permission: `business_profile.scan` for creation; the route tests define read and delete authorization.

A request holds the HTTP connection for up to 25 seconds. Only public HTTP(S) websites are allowed; private IP literals, local/internal hosts, credentials in URLs, Instagram and marketplace sources are rejected with 422. The authoritative post-DNS SSRF check belongs to sineva-ai. Up to five scans per workspace per rolling hour; 429 carries `Retry-After`. Deleted records still count. Results expire after 24 hours.

The proposed upstream call is `POST /internal/v1/profile/scan` with the internal key and signed context. Fixtures `scan_*.json` pin the platform proposal, pending sineva-ai acceptance. Transport errors return typed 502/503 and mark the record failed. Manual onboarding remains available. The profile pack is not yet attached to chat requests; that requires the sineva-ai contract.

## Release

Migration `20261022160000_business_profile_and_onboarding` adds seven tables under `platform`. Deploy together with the Library and Inbox migrations after the integration suite passes. Existing local migration history placement must be inspected before deploying; never reset the shared database. See the migration workflow and checkpoint for that database's known history placement.
