// Wire types of the Library API (snake_case, ADR-0003). The browser reads these;
// `server/http/library_view_contract.ts` keeps them in step with the server.
// Nothing here exposes the storage key, the content hash or ingest internals.

export type LibraryStatusView = 'queued' | 'processing' | 'ready' | 'needs_attention' | 'failed' | 'deleting';
export type LibrarySourceTypeView = 'upload' | 'url' | 'crawl' | 'sync' | 'chat_save' | 'note' | 'ai_tool';
export type LibraryLanguageView = 'id' | 'en' | 'mixed' | 'unknown';

export interface LibraryScopeView {
  scope_type: 'workspace' | 'specialist' | 'squad';
  /** The agent slug or squad id; null for the workspace scope. */
  scope_ref: string | null;
}

/** Codes and numbers only (FR-LIB-28): the UI maps `reason_code` to copy. */
export interface LibraryStatusDetailView {
  reason_code?: string;
  pages?: number[];
  progress?: { current: number; total: number };
  personal_data_hint?: boolean;
}

export interface LibraryDocumentView {
  id: string;
  folder_id: string | null;
  title: string;
  source_type: LibrarySourceTypeView;
  mime_type: string;
  byte_size: number;
  language: LibraryLanguageView;
  status: LibraryStatusView;
  status_detail: LibraryStatusDetailView | null;
  page_count: number | null;
  chunk_count: number;
  embedding_model: string | null;
  last_indexed_at: string | null;
  source_updated_at: string | null;
  review_interval_days: number | null;
  review_due_at: string | null;
  scopes: LibraryScopeView[];
  /** True while a scope change has not reached sineva-ai: retrieval may still use the old labels. */
  acl_sync_pending: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LibraryDocumentListView {
  items: LibraryDocumentView[];
  next_cursor: string | null;
}

export interface LibraryFolderView {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface LibraryUploadTicketView {
  document_id: string;
  upload_url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expires_in_seconds: number;
  max_bytes: number;
}

export interface LibraryUsageView {
  documents: number;
  storage_bytes: number;
  ocr_pages_month: number;
  within_limits: { documents: boolean; storage: boolean; ocr_pages: boolean };
}

export interface LibraryTryResultView {
  results: Array<{
    document_id: string;
    title: string;
    chunk_id: string;
    page: number | null;
    section_path: string | null;
    snippet: string;
    source_uri: string | null;
    trust_label: string;
  }>;
  abstained: boolean;
  abstain_reason: string | null;
  principals: string[];
}

export interface LibraryPreviewView {
  document_id: string;
  status: LibraryStatusView;
  page_count: number;
  pages: Array<{ page: number; text: string; ocr: boolean; readable: boolean }>;
  next_page: number | null;
}
