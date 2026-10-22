import type { LibraryDocumentEntity, LibraryFolderEntity, LibraryIngestEventEntity } from '@/server/domain/library/library_entities';
import type { DocumentAccess, ScopeRef } from '@/server/domain/library/library_access';
import type { LibrarySort, LibrarySourceType, LibraryStatusFilter } from '@/server/domain/library/library';

// Every method takes the workspace id and filters by it: there is no read or
// write by bare document id (tenant isolation layer 2, ADR-0020). A row of
// another workspace is simply not found.

export interface NewLibraryDocument {
  workspace_id: string;
  folder_id: string | null;
  title: string;
  source_type: LibrarySourceType;
  /** Null at creation: the key contains the document id, which the database assigns. */
  storage_key: string | null;
  mime_type: string;
  byte_size: number;
  content_hash: string;
  status_detail: LibraryDocumentEntity['status_detail'];
  review_interval_days: number | null;
  review_due_at: Date | null;
  uploaded_at: Date | null;
  created_by: string;
  scopes: ScopeRef[];
  /** True when the scopes were taken from the collection, not chosen. */
  access_inherited: boolean;
}

export type LibraryDocumentPatch = Partial<
  Pick<
    LibraryDocumentEntity,
    | 'title'
    | 'storage_key'
    | 'folder_id'
    | 'status'
    | 'status_detail'
    | 'language'
    | 'page_count'
    | 'chunk_count'
    | 'ocr_page_count'
    | 'embedding_model'
    | 'review_interval_days'
    | 'ingest_job_id'
    | 'last_ingest_sequence'
    | 'byte_size'
    | 'content_hash'
    | 'mime_type'
    | 'access_inherited'
  >
> & {
  last_indexed_at?: Date | null;
  review_due_at?: Date | null;
  review_reminded_at?: Date | null;
  ingest_attempted_at?: Date | null;
  acl_synced_at?: Date | null;
  uploaded_at?: Date | null;
};

export interface LibraryDocumentFilter {
  workspace_id: string;
  /** Required: derived from the session, so a restricted member's list never leaks scoped documents. */
  access: DocumentAccess;
  /** `reading` is queued and processing together. */
  status?: LibraryStatusFilter;
  /** `deleting` documents are hidden unless asked for by status. */
  scope_type?: ScopeRef['scope_type'];
  scope_ref?: string;
  /** Documents this specialist can use: Everyone's plus the ones scoped to it. */
  used_by?: string;
  sort?: LibrarySort;
  source_type?: LibrarySourceType;
  language?: LibraryDocumentEntity['language'];
  /** `null` means the root; `undefined` means any folder. */
  folder_id?: string | null;
  q?: string;
  cursor?: string;
  limit: number;
}

export interface LibraryUsage {
  documents: number;
  storage_bytes: number;
  /** Pages read by OCR in the month, by `last_indexed_at`. */
  ocr_pages_month: number;
}

export interface LibrarySummaryCounts {
  total: number;
  by_status: { ready: number; reading: number; needs_attention: number; failed: number };
  /** Documents per collection; collections without documents are absent. */
  by_folder: Record<string, number>;
  in_root: number;
}

export interface LibraryKnowledgeCounts {
  /** Ready documents with the Everyone scope. */
  everyone: number;
  /** Ready documents scoped to a specialist but not to Everyone, by slug. */
  specialist_only: Record<string, number>;
}

export interface LibraryDocumentRepository {
  /** Creates the row and its scopes together. */
  create(input: NewLibraryDocument): Promise<LibraryDocumentEntity>;
  findById(workspaceId: string, id: string): Promise<LibraryDocumentEntity | null>;
  list(filter: LibraryDocumentFilter): Promise<{ items: LibraryDocumentEntity[]; next_cursor: string | null }>;
  update(workspaceId: string, id: string, patch: LibraryDocumentPatch): Promise<LibraryDocumentEntity>;
  replaceScopes(workspaceId: string, id: string, scopes: ScopeRef[]): Promise<void>;
  /**
   * Applies an ingest result only if `jobId` is the document's current job and
   * `sequence` is above the last applied one, in one conditional write.
   * Returns null when it did not apply (stale, or another job).
   */
  applyIngestUpdate(
    workspaceId: string,
    id: string,
    jobId: string,
    sequence: number,
    patch: LibraryDocumentPatch,
  ): Promise<LibraryDocumentEntity | null>;
  /** An uploaded document with this hash that shares at least one scope. */
  findDuplicate(
    workspaceId: string,
    contentHash: string,
    scopes: ScopeRef[],
    excludeId?: string,
  ): Promise<LibraryDocumentEntity | null>;
  usage(workspaceId: string, monthStart: Date): Promise<LibraryUsage>;
  /** Counts for what `access` may see. Pending uploads and documents being deleted are not counted. */
  summary(workspaceId: string, access: DocumentAccess): Promise<LibrarySummaryCounts>;
  /** Ready documents by who can use them, for "Knows N documents". Access is applied by the caller. */
  knowledgeCounts(workspaceId: string): Promise<LibraryKnowledgeCounts>;
  /** Uploaded documents in this collection that follow its access. */
  listInheriting(workspaceId: string, folderId: string): Promise<LibraryDocumentEntity[]>;
  delete(workspaceId: string, id: string): Promise<void>;
  /** Uploaded documents whose review is due and not yet reminded. Cross-workspace by design: the sweep is not a request. */
  listReviewDue(now: Date, limit: number): Promise<LibraryDocumentEntity[]>;
}

export interface NewLibraryFolder {
  workspace_id: string;
  parent_id: string | null;
  name: string;
  created_by: string;
  scopes: ScopeRef[];
}

export interface LibraryFolderRepository {
  /** Throws `ConflictError` when the name is taken under the same parent. */
  create(input: NewLibraryFolder): Promise<LibraryFolderEntity>;
  findById(workspaceId: string, id: string): Promise<LibraryFolderEntity | null>;
  /** The whole tree of one workspace; folders are few and the depth rule needs all of them. */
  listAll(workspaceId: string): Promise<LibraryFolderEntity[]>;
  update(
    workspaceId: string,
    id: string,
    patch: { name?: string; parent_id?: string | null },
  ): Promise<LibraryFolderEntity>;
  replaceScopes(workspaceId: string, id: string, scopes: ScopeRef[]): Promise<void>;
  delete(workspaceId: string, id: string): Promise<void>;
  /** Folders and uploaded documents directly inside. */
  contentCounts(workspaceId: string, id: string): Promise<{ folders: number; documents: number }>;
}

export interface NewLibraryIngestEvent {
  document_id: string;
  workspace_id: string;
  event_id: string | null;
  job_id: string | null;
  sequence: number | null;
  stage: string;
  outcome: string;
  status: LibraryIngestEventEntity['status'];
  detail: Record<string, unknown> | null;
  applied: boolean;
}

/** Append-only by construction: there is no update or delete to call. */
export interface LibraryIngestEventRepository {
  /** False when an event with the same `event_id` was already stored (a retried callback). */
  append(event: NewLibraryIngestEvent): Promise<{ inserted: boolean }>;
  list(workspaceId: string, documentId: string, limit: number): Promise<LibraryIngestEventEntity[]>;
}
