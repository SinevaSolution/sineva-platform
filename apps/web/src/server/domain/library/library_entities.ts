import type {
  LibraryLanguage,
  LibrarySourceType,
  LibraryStatus,
} from '@/server/domain/library/library';
import type { ScopeRef } from '@/server/domain/library/library_access';

/**
 * What the status chip needs beyond the status itself. Codes and numbers only:
 * never text read from a document (logs and audit hold no content).
 */
export interface LibraryStatusDetail {
  reason_code?: string;
  /** Page numbers the reader could not read or flagged (FR-LIB-08). */
  pages?: number[];
  progress?: { current: number; total: number };
  /** KTP or NPWP pattern found: shown as a note, never blocks (FR-LIB-26). */
  personal_data_hint?: boolean;
}

export interface LibraryFolderEntity {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Who can use what is in this collection (ADR-0033). Never empty. */
  scopes: ScopeRef[];
}

export interface LibraryDocumentEntity {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  title: string;
  source_type: LibrarySourceType;
  source_id: string | null;
  /** Where the original file lives. Internal: never put on the wire. */
  storage_key: string | null;
  mime_type: string;
  byte_size: number;
  content_hash: string;
  language: LibraryLanguage;
  status: LibraryStatus;
  status_detail: LibraryStatusDetail | null;
  page_count: number | null;
  chunk_count: number;
  ocr_page_count: number;
  embedding_model: string | null;
  last_indexed_at: string | null;
  source_updated_at: string | null;
  review_interval_days: number | null;
  review_due_at: string | null;
  review_reminded_at: string | null;
  ingest_job_id: string | null;
  ingest_attempted_at: string | null;
  last_ingest_sequence: number;
  acl_synced_at: string | null;
  /** Null until `complete`: the row is not a document yet. */
  uploaded_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  scopes: ScopeRef[];
  /** True while the document follows its collection's access; false once someone chose its own. */
  access_inherited: boolean;
}

export interface LibraryIngestEventEntity {
  id: string;
  document_id: string;
  workspace_id: string;
  event_id: string | null;
  job_id: string | null;
  sequence: number | null;
  stage: string;
  outcome: string;
  status: LibraryStatus | null;
  detail: Record<string, unknown> | null;
  applied: boolean;
  created_at: string;
}
