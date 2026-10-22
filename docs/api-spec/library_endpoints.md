---
title: "Sino Library Endpoints"
category: "api-spec"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "api-spec", "library", "rag", "upload", "ingest", "sineva-ai"]
summary: "The Library routes (documents, collections, uploads, try, usage, summary, knowledge), the internal ingest events route, the statuses and error codes, and the contract the platform proposes to sineva-ai."
related_docs:
  - "overview.md"
  - "swagger_and_openapi.md"
  - "../decisions/0030-library-ownership-split-and-ingest-contract.md"
  - "../decisions/0033-library-collections-access-and-plain-language.md"
  - "../decisions/0002-seaweedfs-presigned-uploads.md"
---

# Sino Library endpoints

Source: `apps/web/src/app/api/v1/workspaces/[workspace_id]/library/**`, `app/api/internal/v1/library/ingest-events/route.ts`, `application/use-cases/library/`, `application/dtos/library_dto.ts`, `domain/library/`. Decision: [ADR-0030](../decisions/0030-library-ownership-split-and-ingest-contract.md). Envelope and errors are in [overview](overview.md). The workspace comes from the URL and must equal the session membership; another workspace's id is a 404. No body or query names a user or workspace, and every body is `strict`.

"Current" is what the code does. "Target" is decided but not built.

## Gotchas first

- **Nothing becomes `ready` without sineva-ai.** The platform stores metadata and the original file only. Until `sineva-ai` implements the contract (WP-M1-11 to 13), every document stays `queued`; if the hand-over fails, `status_detail.reason_code` is `ingest_service_unavailable` (503 side) or `ingest_service_error` (502 side) and the `complete` call still answers 200.
- **A pending upload is not a document.** `POST uploads` creates a row with `uploaded_at = null`. Lists, quotas and reads ignore it until `complete`. Rows abandoned between the two calls are not swept yet (see "Not built yet").
- **Scope is computed on the server.** `try` takes at most an `agent_slug`; principals come from the session. A member limited to selected specialists sees workspace documents and their specialists' only; a document they cannot see is a 404, not a 403.
- **Delete is resumable.** A document that cannot be fully deleted stays `deleting` (hidden from lists) and `DELETE` again resumes.
- **Collections carry access (ADR-0033).** The UI says "collection" for a folder. A collection has `scopes` (Everyone is the `workspace` scope, or chosen specialists). A document sent without `scopes` follows its collection (`access_inherited: true`); sending `scopes` is an override (`false`); `inherit_access: true` on `PATCH` goes back. Changing a collection's `scopes` relabels the documents that follow it. `squad` and `workflow` are reserved scope types: both answer 422 until those features ship.
- **`workspace` scope stores the workspace id** as `scope_ref` internally; the API shows `scope_ref: null` for it.

## Routes

All paths are under `/api/v1/workspaces/{workspace_id}/library`. Errors always include 401, 403 and 404 (not a member of the workspace) in addition to those listed.

| Method | Path | Permission | Success | Other errors |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/uploads` | `library.upload` | 201 ticket | 409 `already_in_library`, 422, 502 (presign), 403 `entitlement_required` |
| `POST` | `/documents/{id}/complete` | `library.upload` | 200 document | 409 `upload_not_found`, 422 (`size_mismatch`, `hash_mismatch`, `file_content_mismatch`), 409 `already_in_library` |
| `POST` | `/documents` | `library.upload` | 201 document | 404 (conversation), 409, 422, 502, 403 `entitlement_required` |
| `GET` | `/documents` | `library.read` | 200 `{ items, next_cursor }`; filters `status` (also `reading`), `used_by`, `sort` (`newest`, `oldest`, `name`, `size`) | 422 |
| `GET` | `/documents/{id}` | `library.read` | 200 document | none |
| `PATCH` | `/documents/{id}` | `library.manage` | 200 document (`scopes` or `inherit_access`, not both) | 404 (folder), 422, 502 or 503 (acl relabel) |
| `DELETE` | `/documents/{id}` | `library.delete` | 200 `{ id, deleted, chunks_deleted, vectors_deleted }` | 502 `delete_unverified`, 502, 503 |
| `POST` | `/documents/{id}/reindex` | `library.manage` | 202 document | 502, 503, 403 `entitlement_required` |
| `GET` | `/documents/{id}/preview` | `library.read` | 200 pages | 409 `preview_not_ready`, 502, 503 |
| `GET` | `/summary` | `library.read` | 200 `{ total, by_status, by_folder, in_root }` | none |
| `GET` | `/knowledge` | `library.read` | 200 `{ everyone, specialists }` | none |
| `GET` | `/folders` | `library.read` | 200 `{ items }` (each with `scopes`) | none |
| `POST` | `/folders` | `library.manage` | 201 folder (`scopes` default to the parent's, else Everyone) | 404 (parent), 409, 422 `folder_depth_exceeded` |
| `PATCH` | `/folders/{id}` | `library.manage` | 200 folder (`scopes` relabels the documents that follow it; a failed relabel is flagged on the document, not an error here) | 404, 409, 422 `folder_cycle`, `folder_depth_exceeded` |
| `DELETE` | `/folders/{id}` | `library.manage` | 200 `{ id, deleted }` | 409 `folder_not_empty` |
| `POST` | `/try` | `library.manage` | 200 passages | 403 (specialist), 422, 502, 503 |
| `GET` | `/usage` | `library.usage.view` | 200 counts, `storage_limit_bytes` (null without a limit) | none |
| `POST` | `/api/internal/v1/library/ingest-events` | internal key | 200 `{ applied, duplicate }` | 401, 404, 422 |

`library.sources.manage` and the `/sources` routes arrive with URL, crawl and synced sources (M2).

## Upload flow

1. `POST /uploads` with `file_name`, `content_type`, `byte_size` (1 to 25 MB), `sha256` (lowercase hex, computed in the browser), optional `folder_id`, `scopes` (omit to take the collection's access, Everyone at the top level) and `review_interval_days`. Accepted types: PDF, DOCX, XLSX, CSV, PPTX, TXT, MD, JPG, PNG, WEBP (extension and content type must agree). Quotas are checked through the entitlement seam (`library.documents.max`, `library.storage_mb`, and `library.ocr_pages.monthly` for scannable types); in `open` mode they log and pass. Answer: `{ document_id, upload_url, method: "PUT", headers, expires_in_seconds, max_bytes }`. The browser PUTs the file with exactly those headers.
2. `POST /documents/{id}/complete` (no body). The platform reads the stored object, compares size and SHA-256, checks magic bytes, audits `library.document.uploaded` and asks sineva-ai to ingest. Only the uploader can complete.

## Statuses and `status_detail`

The UI shows plain-language states (ADR-0033): Uploading (browser only), Reading (`queued`, `processing`), Ready, Needs a look (`needs_attention`) and Couldn't read (`failed`); `deleting` is never shown. The wire statuses are:

`status`: `queued`, `processing`, `ready`, `needs_attention`, `failed`, `deleting`. `status_detail` carries codes and numbers only: `reason_code`, `pages` (flagged page numbers), `progress` (`current`, `total`), `personal_data_hint`. The UI maps `reason_code` to copy; the platform writes `ingest_service_unavailable` and `ingest_service_error`, sineva-ai writes the rest (`password_protected`, `unreadable_pages`, `no_text_found`, `hidden_text_detected`, `unsupported_content`, `parse_failed`, `ocr_failed`, `embedding_failed`, `too_many_pages`, `storage_object_missing`).

## Audit events

`library.document.uploaded`, `.indexed`, `.failed` (also for `needs_attention`, with `metadata.status`), `.scope_changed` (with before and after principals), `.reindexed`, `.deleted` (with the verified counts). `library.citation.rejected` is forwarded by sineva-ai through `POST /internal/v1/audit-events`; the platform does not emit it. Metadata holds ids, counts and codes, never titles or text.

## Contract with sineva-ai (proposed by the platform, pending sineva-ai)

The fixtures `apps/web/src/__tests__/contract/fixtures/library_*.json` are the contract; their README lists each file against its call. Calls from the platform use `X-Internal-Api-Key`, plus `X-Sineva-Context` when a user started the action. Summary:

| Call | Purpose |
| :--- | :--- |
| `POST /api/v1/knowledge/documents` | Request ingest (202 `{ job_id, status }`) |
| `GET /api/v1/knowledge/ingest/{job_id}?tenant_id=` | Poll a job |
| `POST /api/v1/knowledge/documents/{id}/reindex` | New job for an indexed document |
| `PUT /api/v1/knowledge/documents/{id}/acl` | Relabel chunks without re-embedding |
| `DELETE /api/v1/knowledge/documents/{id}?tenant_id=` | Delete text, chunks, vectors, and report `vectors_remaining` and `verified` |
| `POST /api/v1/knowledge/search` | Retrieve with the platform-computed principals |
| `GET /api/v1/knowledge/documents/{id}/text?tenant_id=&page_from=&page_to=` | Extracted text for the OCR preview |
| `POST /api/internal/v1/library/ingest-events` (sineva-ai to platform) | Progress events with `event_id` and per-job `sequence` |

## Not built yet

| Missing | Effect today |
| :--- | :--- |
| Sweep of abandoned pending uploads | A row and object for an upload that never completed stay until a sweep exists. They are invisible and uncounted. |
| Inbox adapter for review reminders | `SendLibraryReviewRemindersUseCase` exists and is tested; nothing calls it (needs the Inbox backend, WP-M1-40). `review_due_at` is set correctly. |
| "Source deleted" on old citations | No citation table exists in the platform yet. The delete keeps no title tombstone (a Legal question, OQ-LIB-6). |
| Saving a chat attachment (file) to the Library | `chat_save` saves text only. |
| Per-plan limit values and points estimates | M1 shows counts and whether a quota holds; values need the plan catalog and the rate card. |
| URL, crawl and synced sources, conflict checks | M2 and M4. |

## Related

[Overview](overview.md), [swagger and OpenAPI](swagger_and_openapi.md), [ADR-0030](../decisions/0030-library-ownership-split-and-ingest-contract.md), [ADR-0002](../decisions/0002-seaweedfs-presigned-uploads.md).
