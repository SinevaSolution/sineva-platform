---
title: "Library Ownership Split and Ingest Contract"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-22"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "library", "rag", "ingest", "scopes", "storage", "cross-service"]
summary: "The platform owns Library metadata, scopes, quotas, upload and the retrieval scope; sineva-ai owns parsing, OCR, chunking, vectors and retrieval. The two meet at a small ingest contract that the platform proposes and sineva-ai must accept."
related_docs:
  - "README.md"
  - "0002-seaweedfs-presigned-uploads.md"
  - "0013-internal-service-auth-header.md"
  - "0015-sineva-ai-owns-internal-chat-contract.md"
  - "0016-upstream-failures-return-502-503.md"
  - "0021-signed-internal-context.md"
  - "0026-profile-preferences-and-avatar-pipeline.md"
  - "../../docs/implementation-plan/M1-chat-core.md"
adr_id: "0030"
decision_status: "accepted"
supersedes: []
---

# 0030 Library Ownership Split and Ingest Contract

Accepted on the Founder's delegation, using the implementation plan's recommended option for WP-M1-32 (platform half). This is a cross-service ADR: `sineva-ai` needs a twin, and the contract below is **proposed by the platform, pending sineva-ai**. Evidence labels: **official** means read from a repo or plan document, **inference** means derived from it.

## Context

The PRD "Sino Library (Knowledge & RAG)" splits the work: the platform holds document and folder metadata, scopes, quotas, the presigned upload and the audit events and computes the retrieval scope; `sineva-ai` parses, runs OCR, chunks, embeds, stores vectors in Qdrant and retrieves (**official**, PRD section 5 "Ownership"). Nothing of this exists on either side today. `sineva-ai` is built by another team on its own schedule (WP-M1-11 to 13), so the platform cannot call a real service yet, and it must not invent one.

Three problems need one decision each: where the boundary sits, how scope reaches the vector store, and what a document shows while `sineva-ai` is absent.

## Decision

1. **Boundary.** The platform owns `library_folders`, `library_documents`, `library_document_scopes` and `library_ingest_events` (schema `platform`), the original file in SeaweedFS under `t/{workspace_id}/library/{document_id}/source`, quotas through the entitlement seam, audit events, and the **retrieval scope**. `sineva-ai` owns everything derived from the file: extracted text, chunks, vectors, language detection, OCR, hidden-text detection and the abstention rule. The platform never parses a document and never stores chunk text.
2. **Scope is computed by the platform, per request.** `computeRetrievalScope` (domain) returns `{ tenant_id, principals }` where principals are `workspace` and `agent:<slug>` of the executing specialist. It takes the workspace from the session, never from the client or the model, and refuses a specialist the member may not use (FR-LIB-15). Squad principals arrive with squads (M4). `sineva-ai` stores the same strings as the `acl` array of each chunk, so a scope change is a relabel (`PUT .../acl`), not a re-embed.
3. **Ingest contract (proposed).** Six calls from the platform to `sineva-ai` and one callback, all under `X-Internal-Api-Key`, with `X-Sineva-Context` on user-initiated calls. Request ingest (`POST /api/v1/knowledge/documents`), poll (`GET /api/v1/knowledge/ingest/{job_id}`), reindex, ACL update, delete with verified counts, scoped search, and text preview. Progress returns through `POST /api/internal/v1/library/ingest-events` (internal key only; the platform checks that `tenant_id` matches the document). The platform generates the `job_id` and sends it, so a callback that races the accepting response still correlates. Events carry a monotonic `sequence` per job; the platform applies an event only if its job is the current job and its sequence is higher than the last applied one, and stores every event either way (`applied` flag). The exact bodies are the JSON fixtures `apps/web/src/__tests__/contract/fixtures/library_*.json`.
4. **Honest status.** A document is created `queued`. If `sineva-ai` is unreachable (503) or answers badly (502) when the platform requests ingest, the document **stays `queued`** with `status_detail.reason_code = ingest_service_unavailable` (or `ingest_service_error`) and an ingest event records the attempt. It never becomes `ready` without a `ready` event from `sineva-ai`. `POST .../reindex` retries a queued document that has no running job; for a document with a running job it refreshes status by polling instead of starting a second job.
5. **Delete really deletes, and proves it.** `DELETE` marks the document `deleting`, asks `sineva-ai` to delete text, chunks and vectors, requires `verified = true` and `vectors_remaining = 0` in the answer, deletes the file, and only then removes the rows and writes `library.document.deleted` with the counts. A stray vector, an unreachable `sineva-ai` or a failed file delete leaves the document in `deleting` (hidden from lists, excluded from retrieval by the platform re-check) and answers 502 or 503; calling `DELETE` again resumes. A document that was never sent to `sineva-ai` skips that call.
6. **Quotas use the entitlement seam.** Document count, storage MB and OCR pages per month call `EntitlementService.assert` with the keys already registered (`library.documents.max`, `library.storage_mb`, `library.ocr_pages.monthly`). In `open` mode the checks log and pass (WP-M0-48). A hard limit blocks new uploads only; nothing existing is deleted.
7. **Type and size are checked twice.** The route validates extension, declared content type and a 25 MB limit (OQ-LIB-5 default); `complete` reads the stored object, compares size and SHA-256 with what was declared, and checks magic bytes (PDF, ZIP container for OOXML, JPEG, PNG, WebP; plain text must hold no NUL bytes). A mismatch deletes the object and fails with 422. The declared type is only a hint, as for avatars (ADR-0026).
8. **Duplicates.** An identical SHA-256 that shares any scope with an existing, uploaded document in the same workspace is rejected with 409 `already_in_library`, the existing document id in the error detail. `complete` re-checks with the server-computed hash.
9. **Folders.** Depth at most 3, names unique per parent. Root uniqueness uses a non-null `parent_key` (the parent id, or the workspace id at the root) in the unique index, because a nullable parent column does not make a unique index work in Postgres. Deleting a folder with folders or documents inside is 409 `folder_not_empty`; there is no cascade.
10. **Personal data hint.** `status_detail.personal_data_hint` is set by the platform for notes and chat saves (shared PII detectors, KTP and NPWP kinds) and by `sineva-ai` events for files. It never blocks.

## Consequences

- One migration adds four tables. `library_sources` (M2) and `library_conflicts` (M4) are not created.
- `sineva-ai` must implement the contract (or tell us what to change) before WP-M1-32 can run end to end. Until then every upload stays `queued`, which is the intended, visible behavior.
- The platform trusts `sineva-ai` for `vectors_remaining`. A lying fake cannot be detected by the platform alone; the tenant canary on real Qdrant in `sineva-ai` CI (PRD P0.7) is the second control.
- `original file` objects stay in the platform bucket. Extracted text lives wherever `sineva-ai` puts it and is deleted by its delete call.
- Citations in old chats ("Source deleted", FR-LIB-25) need the citation persistence of the chat work packages. This change keeps the document row's id and title only until delete; it does not add a tombstone table, because keeping a deleted document's title is a Legal question (OQ-LIB-6).
- Overdue review reminders need the Inbox backend (WP-M1-40). The sweep use case and its port exist; the adapter does not.

## Alternatives considered

- **Platform parses simple text and notes itself.** Fewer round trips for notes, but two parsing paths means two chunking behaviors and two language detectors. Rejected: one reader.
- **Callback carries the whole status, no polling.** Simplest, but a lost callback leaves a document `processing` forever. The poll call exists for that case.
- **`sineva-ai` generates the job id.** Natural, but the platform would learn it only from the response and callbacks can arrive first. Rejected: platform-generated id.
- **Mark a document `ready` optimistically when `sineva-ai` is down.** Rejected outright (ADR-0008): a document that cannot be read must not look readable.
- **Cascade folder delete.** Rejected by the PRD (FR-LIB-04, no silent cascade).
- **A tombstone table for citations now.** Deferred (see Consequences).
