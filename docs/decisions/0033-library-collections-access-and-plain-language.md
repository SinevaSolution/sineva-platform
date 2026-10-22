---
title: "Library Collections, Who Can Use This, and Plain Language"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "library", "scopes", "access", "copy", "ux"]
summary: "Collections (folders) carry 'Who can use this' (Everyone or chosen specialists), documents inherit it and may override it, Squads and Workflows are reserved scope types, retrieval scope equals visible access, and the Library never shows technical words."
related_docs:
  - "README.md"
  - "0023-i18n-message-catalogs.md"
  - "0030-library-ownership-split-and-ingest-contract.md"
  - "../../docs/implementation-plan/M1-chat-core.md"
adr_id: "0033"
decision_status: "accepted"
supersedes: []
---

# 0033 Library Collections, Who Can Use This, and Plain Language

Accepted on the Founder's delegation. It extends [0030](0030-library-ownership-split-and-ingest-contract.md) (which stays in force) for the revamped Library page: how access is set, inherited and overridden, what a specialist "knows", and which words a customer may read. Evidence labels: **official** is read from a repo or plan document, **inference** is derived from it.

## Context

The Library backend from 0030 already stores a scope list per document (`workspace`, `specialist`, `squad`) and computes the retrieval scope from the session. The page built on it is a flat list with a native-feeling scope dropdown and words such as "OCR pages", "Queued" and "index". The Founder found it unattractive and too technical. Three things were missing in the model, not only in the UI: folders had no access of their own (so every upload needed a scope choice), nothing said what a given specialist can use, and Workflows (M3) were not a possible scope even though Squads (M4) were reserved (**official**: `LIBRARY_SCOPE_TYPES`).

## Decision

1. **Words.** The UI says **collection** for what the code and API call `folder` (`library_folders`, `/library/folders`). Wire names do not change. "Sino Library" stays untranslated (ADR-0023).
2. **Who can use this.** A collection carries an access list: **Everyone** (the `workspace` scope) or chosen specialists (`specialist` scopes). Everyone means Sino in team chats, every specialist, and later Squads and Workflows. Stored in a new table `library_folder_scopes` (same shape as `library_document_scopes`, unique per folder, type and ref). The migration backfills every existing folder with the `workspace` scope, so behavior does not change for current data. A new collection starts with its parent's access, or Everyone at the top level; nothing is copied to sub-collections afterwards (nested collections are independent, because a live inheritance chain across three levels is hard to explain and cheap to get wrong).
3. **Documents inherit, and may override.** `library_documents.access_inherited` (boolean, default `false`, so existing documents keep their explicit scopes). An upload or note created without `scopes` takes its collection's access (Everyone at the top level) and is `access_inherited = true`. Sending `scopes` sets `false` (an override). `inherit_access: true` on `PATCH` resets to inheriting. Two propagation rules, both a relabel and never a re-read (FR-LIB-14): moving an inheriting document adopts the target collection's access; changing a collection's access rewrites the scopes of its direct, inheriting documents and sends the ACL update to sineva-ai for those already sent. A failed relabel leaves `acl_synced_at` null, which the document shows as "Updating who can use this" (the existing `acl_sync_pending`).
4. **Reserved scope types.** `workflow` joins `LIBRARY_SCOPE_TYPES` next to `squad`. The request schemas accept only `workspace` and `specialist`, so `squad` and `workflow` are rejected with 422 until those features ship. The reserved principal strings are `squad:<id>` and `workflow:<id>`; `computeRetrievalScope` never emits them yet, and a member limited to selected specialists never matches them. The picker lists Squads and Workflows as disabled "Soon" options.
5. **Retrieval scope equals access.** The principals sent to retrieval are what decides what an answer may use, and they follow the same rule as visibility: Sino in a team chat gets `workspace` only; a specialist gets `workspace` and `agent:<slug>`. So a document marked "Everyone" is usable by all, and a document limited to SinoSales is used by SinoSales and by nobody else, including Sino in the Hub (a Hub answer routed to a specialist by @mention carries that specialist's slug and so its principals). The platform computes this from the session (existing `computeRetrievalScope`); the new tests assert the strings for team chat, each specialist and a restricted member, and that a document's chunk labels (`principalsForScopes`) match.
6. **What a specialist knows.** "Knows N documents" counts documents that are `ready`, uploaded and not being deleted, and that carry the `workspace` scope or the `specialist` scope of that slug. `GET /library/knowledge` returns the count for Everyone (what Sino in team chats can use) and for each specialist the caller may use; counts are computed per request from the caller's visible set. The chip links to the Library filtered by `used_by=<slug>`, which lists documents with the `workspace` scope or that specialist's scope (so a filter shows what the specialist can really use, not only what was assigned to it).
7. **Summary counts.** `GET /library/summary` returns status counts (ready, reading, needs a look, could not read) and per-collection document counts for the caller's visible set. `reading` groups `queued` and `processing` and is also accepted as a `status` filter value.
8. **Plain-language statuses.** The UI states are: **Uploading** (browser to storage, client only), **Reading** (`queued`, `processing`; "Sino is reading it", with page progress when known), **Ready**, **Needs a look** (`needs_attention`; some pages could not be read; Replace file or Try again), **Couldn't read** (`failed`). `deleting` is never shown. The wire statuses do not change.
9. **No technical words.** The copy lint gains a `technical_term` rule over both catalogs: OCR, embedding(s), chunk(s), vector(s), index/indexing/indexed, ingest, token(s), RAG, payload, webhook, JSON, BFF, plus the Indonesian equivalents (indeks, mengindeks, pengindeksan, vektor, tokenisasi, penyematan). "Pages read from photos and scans" replaces "OCR pages". Sizes always show KB, MB or GB, never raw bytes. The rule applies to every catalog string (email and specialist copy included because they run the same lint), not only the Library. Code, routes and wire keys keep their names (`ocr_pages_month`).
10. **Replace file.** A new upload that takes over the old document's collection and access, followed by deleting the old document once the new one is received. It is orchestrated in the browser: there is no replace endpoint and no version history. A failure between the two steps leaves both documents (visible, nothing lost); an identical file is refused by the existing duplicate check.
11. **Storage bar.** The page draws used storage against a limit only when an entitlement limit exists. In `open` mode (M1) there is no quota, so it shows used storage as text; inventing a ceiling would be a lie about a plan that does not exist yet.

## Consequences

- One migration: `library_folder_scopes` and `library_documents.access_inherited`. No data is lost; existing folders become Everyone and existing documents keep their explicit scopes.
- Two read endpoints (`summary`, `knowledge`) and one list filter (`used_by`, `sort`). No new mutating route, so no new route policy entry; the folder routes now accept `scopes` and the document `PATCH` accepts `inherit_access`.
- `EntitlementService` gains `numericLimit` so the page can show a quota; it returns null in `open` mode.
- A restricted member (limited to selected specialists) sees only the collections whose access includes Everyone or one of their specialists. A collection hidden from them still has documents of its own; those follow the document rule.
- A banned word appearing in a future string fails CI in either language. Words that are legitimate (a literal "token" in an email link context) must be rephrased; there is no allowlist on purpose.
- Replace file is not atomic. Accepted: the failure mode is a duplicate the person can see and delete, not a loss.

## Alternatives considered

- **Per-document scope only, a default picker on upload** (the previous behavior). Every upload asks a question most people cannot answer; rejected in favor of inheriting from the collection.
- **Live inheritance through sub-collections.** Explaining "this document is Everyone because a grandparent says so" is the kind of rule that makes people distrust access. Rejected; each collection is explicit.
- **A `replace` endpoint that swaps the stored object under the same document id.** Preserves citations and links, but needs a new ingest path on the sineva-ai side (re-read with a different object and hash) that is not in the proposed contract. Deferred; revisit when citations persist (WP-M1-34).
- **A default quota in `open` mode so the bar always shows.** Rejected: a number nobody enforces misleads.
- **Hide `queued` from the UI as "Uploading".** Rejected: after upload completes the file is waiting for Sino, which is "Reading" from the person's point of view and keeps the promise that nothing is Ready until it is.
