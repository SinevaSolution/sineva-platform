import type { LibraryLanguage } from '@/server/domain/library/library';

// The platform side of the Library boundary (ADR-0030). sineva-ai owns
// parsing, OCR, chunking, vectors and retrieval; this port is the whole of what
// the platform asks of it. Failure model (ADR-0016): unreachable is
// `UpstreamUnavailableError` (503), a non-2xx or off-contract answer is
// `UpstreamServiceError` (502). Nothing here may return invented data.

export interface KnowledgeCall {
  /** Signed context minted for the acting user (ADR-0021). */
  context_token: string;
  request_id?: string;
}

export type IngestJobStatus = 'queued' | 'processing' | 'ready' | 'needs_attention' | 'failed';

export interface IngestRequest {
  tenant_id: string;
  document_id: string;
  /** Chosen by the platform so a callback that races the response still correlates. */
  job_id: string;
  storage_key: string;
  mime_type: string;
  byte_size: number;
  content_hash: string;
  source_type: string;
  /** `owner_upload`, `external_tool` and so on: how much the text is trusted (FR-LIB-21). */
  trust_label: string;
  /** Principals that may retrieve the chunks (`workspace`, `agent:<slug>`). */
  acl: string[];
}

export interface IngestAccepted {
  job_id: string;
  status: 'queued' | 'processing';
}

export interface IngestStatusSnapshot {
  job_id: string;
  document_id: string;
  status: IngestJobStatus;
  sequence: number;
  stage: string;
  progress: { current: number; total: number } | null;
  page_count: number | null;
  chunk_count: number | null;
  language: LibraryLanguage | null;
  embedding_model: string | null;
  ocr_pages: number | null;
  reason_code: string | null;
  pages: number[];
  personal_data_hint: boolean;
}

export interface ReindexRequest {
  tenant_id: string;
  document_id: string;
  job_id: string;
  acl: string[];
  reason: 'manual' | 'embedding_model_changed';
}

export interface AclUpdateRequest {
  tenant_id: string;
  document_id: string;
  acl: string[];
}

export interface AclUpdateReport {
  document_id: string;
  acl: string[];
  chunks_updated: number;
  /** Always false: a scope change relabels, it never re-embeds (FR-LIB-14). */
  re_embedded: boolean;
}

export interface DeleteReport {
  document_id: string;
  files_deleted: number;
  text_deleted: boolean;
  chunks_deleted: number;
  vectors_deleted: number;
  /** Counted by sineva-ai after the delete. Anything above zero means the delete is not finished. */
  vectors_remaining: number;
  verified: boolean;
}

export interface SearchRequest {
  tenant_id: string;
  principals: string[];
  query_text: string;
  top_k: number;
}

export interface SearchHit {
  document_id: string;
  chunk_id: string;
  page: number | null;
  section_path: string | null;
  snippet: string;
  source_uri: string | null;
  trust_label: string;
}

export interface SearchResult {
  results: SearchHit[];
  abstained: boolean;
  abstain_reason: string | null;
}

export interface TextPreviewRequest {
  tenant_id: string;
  document_id: string;
  page_from: number;
  page_to: number;
}

export interface TextPreview {
  document_id: string;
  page_count: number;
  pages: Array<{ page: number; text: string; ocr: boolean; readable: boolean }>;
  next_page: number | null;
}

export interface KnowledgeIngestGateway {
  requestIngest(request: IngestRequest, call: KnowledgeCall): Promise<IngestAccepted>;
  getIngestStatus(jobId: string, tenantId: string, call: KnowledgeCall): Promise<IngestStatusSnapshot>;
  requestReindex(request: ReindexRequest, call: KnowledgeCall): Promise<IngestAccepted>;
  updateAcl(request: AclUpdateRequest, call: KnowledgeCall): Promise<AclUpdateReport>;
  deleteDocument(tenantId: string, documentId: string, call: KnowledgeCall): Promise<DeleteReport>;
  search(request: SearchRequest, call: KnowledgeCall): Promise<SearchResult>;
  getText(request: TextPreviewRequest, call: KnowledgeCall): Promise<TextPreview>;
}
