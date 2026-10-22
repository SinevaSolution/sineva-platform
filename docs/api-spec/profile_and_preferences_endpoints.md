---
title: "Profile, Preferences and Avatar Endpoints"
category: "api-spec"
status: "active"
version: "1.0.0"
last_updated: "2026-10-22"
owner: "Sineva Engineering"
tags: ["sineva", "api-spec", "profile", "preferences", "avatar", "me"]
summary: "GET and PATCH /api/v1/me, the /me/profile alias, member attributes, GET and PATCH /me/preferences, and the two-step avatar upload with its image checks."
related_docs:
  - "overview.md"
  - "swagger_and_openapi.md"
  - "../decisions/0026-profile-preferences-and-avatar-pipeline.md"
  - "../decisions/0023-locale-preference-and-i18n-architecture.md"
---

# Profile, preferences and avatar endpoints

Source: `apps/web/src/app/api/v1/me/**`, `apps/web/src/app/api/v1/workspaces/[workspace_id]/members/me/route.ts`, `application/use-cases/profile/`, `application/dtos/profile_dto.ts`, `preferences_dto.ts`, `avatar_dto.ts`. Decision: [ADR-0026](../decisions/0026-profile-preferences-and-avatar-pipeline.md). Envelope and errors are in [overview](overview.md). Identity is always the session user; no route takes a `user_id`.

All bodies are `strict`: an unknown key, including a read-only field, is a 422. Every mutating route needs a signed-in session, and the CSRF header (`x-sineva-action`) when the session is a cookie.

## Profile

| Method | Path | Permission | Success | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/me` | `profile.view` | 200 profile plus `memberships` | 401, 404 |
| `PATCH` | `/api/v1/me` | `profile.update` | 200 profile plus `memberships` | 401, 403, 404, 422 |
| `GET`, `PATCH` | `/api/v1/me/profile` | none | 200 profile (alias, no memberships) | as above |

`/me/profile` is kept for callers of the first version of the page. It shares the use cases and the same body schema, and will be removed when nothing calls it.

Editable fields (`PATCH /api/v1/me`, at least one):

| Field | Rule |
| :--- | :--- |
| `full_name` | 2 to 100 characters, letters (any script), combining marks, space, apostrophe, period, hyphen; trimmed |
| `preferred_name` | 1 to 40 characters, no control characters; `null` clears |
| `salutation` | `none`, `pak`, `bu`, `kak`, `mas`, `mbak`; `null` clears |
| `phone_number` | normalised to E.164 (`0812...` and `62812...` become `+62812...`, other numbers need `+country`); 8 to 15 digits; `null` clears. Changing it clears `phone_verified`. The profile page sends E.164 from its country picker (`SNPhoneInput`) and refuses a number the picked country's rules reject before it calls the API; the server keeps only the shape check above |
| `about_me` | at most 280 characters (code points); `null` clears |
| `use_profile_in_context` | boolean |
| `locale` | a code enabled in `packages/i18n/locales.ts`, not a hardcoded list |
| `timezone` | IANA name, stored in canonical casing |

Read-only, rejected with 422: `email`, `email_verified`, `email_verified_at`, `phone_verified_at`, `status`, `two_factor_enabled`, `id`, `avatar_url`, `created_at`. Date of birth, gender, NIK, home address and personal NPWP are never collected.

Response fields: `id`, `email`, `email_verified`, `full_name`, `preferred_name`, `salutation`, `phone_number`, `phone_verified`, `about_me`, `use_profile_in_context`, `avatar_url`, `locale`, `timezone`, `created_at`, and on `/me` also `memberships[]` (`workspace_id`, `workspace_slug`, `workspace_name`, `role`, `job_title`, `department`).

Audit: `user.profile_updated` with the changed field names (values of personal fields are redacted by key).

## Member attributes

`PATCH /api/v1/workspaces/{workspace_id}/members/me` (permission `profile.update`) edits the caller's own row in that workspace: `job_title` (at most 60, nullable) and `department` (`management`, `finance`, `sales`, `marketing`, `operations`, `hr`, `it`, `customer_support`, `legal`, `other`; nullable). A workspace the caller does not belong to is 404. Role and specialist access are not editable here. Audit: `member.profile_updated`.

## Preferences

`GET /api/v1/me/preferences` returns defaults when the user never saved (it never writes). `PATCH` merges the provided fields into the single `user_preferences` row (permission `preferences.manage_own`, every role).

| Field | Values | Default |
| :--- | :--- | :--- |
| `theme` | `light`, `dark`, `system` | `system` |
| `density` | `comfortable`, `compact` | `comfortable` |
| `focus_mode`, `reduce_motion`, `sidebar_collapsed`, `pause_character`, `room_view` | boolean | `false` |

Audit: `user.preferences_updated` with the changed field names. Wired in the UI today: `theme` (next-themes, synced once per session) and `sidebar_collapsed` (the `sineva_sidebar` cookie stays the fast path). The other fields are stored and returned; their consumers (density, motion, Rooms) land with the design-token and Rooms work.

## Avatar

JPEG, PNG or WebP, up to 2 MB. SVG, GIF and anything else are refused; the declared type is only a hint and the server decides from the first bytes.

1. `POST /api/v1/me/avatar` with `content_type` and `file_size_bytes` returns 201 with `upload_id`, a presigned `upload_url`, `method` (`PUT`), the `headers` to send, `expires_in_seconds` (300) and `max_bytes`. The object goes to `avatars/pending/{user_id}/{upload_id}`.
2. The browser `PUT`s the file to `upload_url`.
3. `POST /api/v1/me/avatar/complete` with `upload_id` makes the server read the object (bounded), check the magic bytes, decode with a 24 megapixel limit, apply the EXIF orientation, crop to a centred square, and write WebP at 256 and 64 px with no metadata to `avatars/{user_id}/{version}/{size}.webp`. It then switches `users.avatar_url` to `avatars/{user_id}/{version}`, deletes the pending object and the previous version, and returns the profile. 404 when nothing was uploaded under that id for the user, 422 for a refused or undecodable file (the pending object is deleted), 502 when storage fails.
4. `GET /api/v1/me/avatar?size=256|64` streams the WebP (`Cache-Control: private`, `nosniff`). The profile's `avatar_url` is this route with `?v={version}`.
5. `DELETE /api/v1/me/avatar` clears the avatar and removes both objects.

Audit: `user.avatar_updated` with `action` of `uploaded`, `removed` or `imported` and `cleanup_failed_count`. The presign step audits nothing (it only issues a URL; `route_policy.ts` records why).

Provider pictures are copied once, at first sign-up, from `lh3.googleusercontent.com` or `avatars.githubusercontent.com` (HTTPS, no redirects, 2 MB, 5 s) through the same pipeline; the remote URL is never stored or served. A failed copy is logged and skipped.

Browser upload needs CORS on the storage bucket for the app origin (`PUT` with `Content-Type`), the same prerequisite as `POST /api/v1/storage/presign`.

## Context projection

`projectProfileContext` (`domain/profile/profile_context_projection.ts`) is the only profile data meant for the model: `display_name`, `salutation`, `locale`, `timezone`, `about_me`, and nothing at all when `use_profile_in_context` is false. Email, phone number and avatar are excluded; `profile_me_use_cases.test.ts` pins the key set.
