---
title: "Profile, Preferences and Avatar Pipeline"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-22"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "profile", "preferences", "avatar", "sharp", "storage"]
summary: "GET and PATCH /api/v1/me own the profile (with /me/profile kept as an alias), preferences live in a one-row-per-user table, and avatars are uploaded through a presigned URL then re-encoded server side with sharp."
related_docs:
  - "README.md"
  - "0002-seaweedfs-presigned-uploads.md"
  - "0018-workspace-tenancy-and-public-contract.md"
  - "0019-role-and-permission-model.md"
  - "0023-locale-preference-and-i18n-architecture.md"
  - "../../docs/implementation-plan/M0-foundations.md"
adr_id: "0026"
decision_status: "accepted"
supersedes: []
---

# 0026 Profile, Preferences and Avatar Pipeline

Accepted on the Founder's delegation, using the implementation plan's recommended option for WP-M0-36. Evidence labels: **official** means read from a primary source or the repo, **inference** means derived from it.

## Context

`GET` and `PATCH /api/v1/me/profile` exist and edit three fields (`full_name`, `locale`, `timezone`). The users table already carries the rest of the PRD section A2 attributes (`preferred_name`, `salutation`, `phone_number`, `about_me`, `use_profile_in_context`, `avatar_url`). Three things are missing: a validated surface for all of them, a place for per-user UI preferences (theme, density, sidebar, motion), and an avatar upload that is safe to accept from an untrusted browser. The profile page and the app shell already depend on the current route and on a `sineva_sidebar` cookie.

## Decision

1. **`/api/v1/me` is the profile resource.** `GET` returns the profile plus workspace memberships with roles; `PATCH` edits only the editable fields. `/api/v1/me/profile` stays as an alias that returns the same profile view (without memberships) and shares the same use cases, so nothing that calls it breaks. The profile page migrates to `/api/v1/me`. The alias is removed in a later change once no caller remains. Bodies are `.strict()`: a read-only field (`email`, `status`, `email_verified_at`, `phone_verified_at`, `two_factor_enabled`, ids) fails with 422 instead of being dropped.
2. **Validation lives in one zod schema** (`application/dtos/profile_dto.ts`): `full_name` 2 to 100 characters of letters, spaces, apostrophe, period and hyphen (Unicode letters, so Indonesian and other names pass); `preferred_name` 1 to 40; `salutation` one of `none | pak | bu | kak | mas | mbak` (OQ-AUTH-10 default); `phone_number` normalised to E.164 (a leading `0` becomes `+62`, `62...` becomes `+62...`, anything else must already be `+` and 8 to 15 digits); `locale` validated against the registry in `packages/i18n` (ADR-0023), never a hardcoded enum; `timezone` an IANA name through `Intl`; `about_me` at most 280 characters; `use_profile_in_context` boolean. A `null` clears an optional field. `phone_verified_at` is never written here (the WhatsApp verification flow is a later package) and changing the phone number clears it, since a verification of the old number says nothing about the new one.
3. **Member attributes** (`job_title` at most 60, `department` from a fixed enum) are edited on `PATCH /api/v1/workspaces/{workspace_id}/members/me`. The target row is the caller's own membership in the URL workspace, taken from the session, so there is no member id in the path or body. A foreign workspace is a 404 by the existing guard.
4. **Preferences are a table, not a profile column.** `user_preferences` has one row per user (`user_id` unique, cascade on delete) with `theme` (`light | dark | system`), `density` (`comfortable | compact`), `focus_mode`, `reduce_motion`, `sidebar_collapsed`, `pause_character`, `room_view`. A missing row means defaults, and `GET` never writes. `PATCH` upserts and merges the provided fields. Permission key `preferences.manage_own`. Why not columns on `users`: preferences change on every toggle and would churn the identity row that sessions and auth read.
5. **Two preferences are wired now.** `sidebar_collapsed`: the cookie `sineva_sidebar` stays the fast path (the server renders the right width with no flash); toggling also `PATCH`es the preference, and the layout seeds the cookie from the stored preference when the cookie is absent, so a second device inherits it. `theme`: the existing `next-themes` provider stays the client mechanism and its choice is synced to `user_preferences.theme` after sign-in; the stored value is applied once per session when it differs. `next-themes` is replaced by the inline theme script in the token re-base package; the sync lives in one small client hook so that change swaps one file.
6. **Avatar upload is two steps and the browser never writes a final object.**
   - `POST /api/v1/me/avatar` takes `content_type` (`image/jpeg`, `image/png`, `image/webp`) and `file_size_bytes` (at most 2 MB) and returns a presigned `PUT` to a **pending** key `avatars/pending/{user_id}/{upload_id}` (`upload_id` is a UUID from the server). The presign signs the content length.
   - `POST /api/v1/me/avatar/complete` takes the `upload_id`. The server reads the pending object (bounded read), checks the **magic bytes** (the declared type is only a hint), rejects SVG and anything that is not JPEG, PNG or WebP, decodes it with a pixel limit (decompression bomb guard), applies EXIF orientation, crops to a square (centre), re-encodes to **WebP at 256 and 64 px with no metadata** (EXIF, ICC and XMP are dropped, so a script payload in a text chunk never reaches storage), writes `avatars/{user_id}/{version}/256.webp` and `64.webp`, deletes the pending object and the previous version, and stores the key in `users.avatar_url`. `DELETE /api/v1/me/avatar` removes both objects and clears the column.
   - Reads go through `GET /api/v1/me/avatar?size=256|64`, an authenticated route that streams the stored bytes with `Cache-Control: private`. The profile view exposes `avatar_url` as that route plus a `v` query for cache busting. The bucket stays private; a public-read bucket would put every avatar behind a guessable URL. Showing another member's avatar needs a route that checks a shared workspace, which belongs with the members list.
   - Remote OAuth images are fetched once, at first sign-up only, never hotlinked: HTTPS only, host allowlist (`lh3.googleusercontent.com`, `avatars.githubusercontent.com`), no redirects, 2 MB cap, 5 s timeout, then the same pipeline. A failure is logged and skipped; sign-up never fails because of an avatar.
7. **Library: `sharp` 0.35.5, pinned exactly** (**official**: libvips based, prebuilt binaries, `rotate()`, `limitInputPixels`, WebP output, metadata dropped unless `withMetadata` is called). It was already in the lockfile as an optional dependency of Next.js image optimisation; this change makes it a direct dependency of `apps/web` at the same version, so no new transitive code arrives. Alternatives are in section Alternatives considered. The image library sits behind a domain port (`ImageProcessor`) so a test uses a fake and the adapter is the only file that imports `sharp`.
8. **Audit.** `user.profile_updated`, `user.avatar_updated` (upload and removal, with `action: uploaded | removed` in metadata), and `user.preferences_updated` are emitted by their use cases. Member attribute edits emit `member.profile_updated` with the workspace id. Values of personal fields are redacted by the audit writer (key based); the changed field names are enough. `user.email_change_requested`, `user.email_changed` and `user.consent_updated` named by the work package are emitted by the email change and consent steps, which are separate from this decision.
9. **Context projection.** `ProfileContextProjection` is the only profile data that may reach the model: `full_name` or `preferred_name`, `salutation`, `locale`, `timezone`, `about_me`, and only when `use_profile_in_context` is true. Email, phone number and avatar are never part of it; a test pins the exact key set.

## Consequences

- One migration: table `platform.user_preferences`. Nothing else in the schema changes (the user columns exist).
- `sharp` becomes a runtime dependency of the web image. It ships native binaries per platform, so the Docker build must install for its own platform (the lockfile already lists the Linux variants).
- Two clients can hold different themes until the next page load; the server value wins once per session. That is acceptable for a preference, and it avoids a flash because the local choice renders first.
- Avatars are not visible to other members until the members list adds a shared-workspace-checked read route. Initials remain the fallback everywhere.
- The `/me/profile` alias is debt with an end date: remove it when no caller remains.

## Alternatives considered

- **Multipart upload through the BFF.** One request, but the server buffers untrusted bytes before any size gate and ADR-0002 already chose presigned uploads. Rejected.
- **Client-side crop and re-encode only.** A hostile client skips it. The server re-encode is the control; a client crop can come later as UX.
- **`jimp` or `@napi-rs/canvas`.** `jimp` is pure JavaScript and slow on large inputs with no pixel limit comparable to libvips; `@napi-rs/canvas` has no stripped-metadata guarantee. `sharp` is already in the tree.
- **Public-read bucket for avatars.** Simple URLs, but unauthenticated enumeration of user images. Rejected for v1.0.
- **Preferences as `users` columns or a JSON column.** Rejected for the churn reason in Decision 4 and because a JSON blob loses enum validation at the database edge.
- **Replace `/me/profile` outright.** Breaks the existing page during the change and any cached client. The alias costs one route file.
