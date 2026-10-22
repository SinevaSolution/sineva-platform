import { randomUUID } from 'node:crypto';
import { ConflictError, UpstreamServiceError, UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import type {
  AclUpdateReport,
  AclUpdateRequest,
  DeleteReport,
  IngestAccepted,
  IngestRequest,
  IngestStatusSnapshot,
  KnowledgeCall,
  KnowledgeIngestGateway,
  ReindexRequest,
  SearchRequest,
  SearchResult,
  TextPreview,
  TextPreviewRequest,
} from '@/server/domain/library/knowledge_ingest_gateway';
import type { DocumentAccess, ScopeRef } from '@/server/domain/library/library_access';
import { canAccessScopes, usableBy } from '@/server/domain/library/library_access';
import type {
  LibraryDocumentEntity,
  LibraryFolderEntity,
  LibraryIngestEventEntity,
} from '@/server/domain/library/library_entities';
import type { LibraryLog, LibraryLogEvent, LibraryLogFields, LibraryReviewInbox } from '@/server/domain/library/library_ports';
import type {
  LibraryDocumentFilter,
  LibraryDocumentPatch,
  LibraryDocumentRepository,
  LibraryFolderRepository,
  LibraryIngestEventRepository,
  LibraryKnowledgeCounts,
  LibraryUsage,
  LibrarySummaryCounts,
  NewLibraryDocument,
  NewLibraryFolder,
  NewLibraryIngestEvent,
} from '@/server/domain/repositories/library_repository';
import type { RequestContext } from '@/server/domain/context/request_context';
import type {
  ContextSigner,
  MintContextOptions,
  SignedContextClaims,
} from '@/server/domain/context/signed_context';
import type { EntitlementCheckResult, EntitlementKey, EntitlementService } from '@/server/domain/entitlements/entitlements';
import { EntitlementRequiredError } from '@/server/domain/entitlements/entitlements';

const iso = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null);

function scopesIntersect(a: ScopeRef[], b: ScopeRef[]): boolean {
  return a.some((x) => b.some((y) => x.scope_type === y.scope_type && x.scope_ref === y.scope_ref));
}

/** Mirrors the Prisma adapter's semantics closely enough for use-case tests. */
export class FakeLibraryDocuments implements LibraryDocumentRepository {
  readonly rows = new Map<string, LibraryDocumentEntity>();
  /** Set to make every write fail, for atomicity tests. */
  failWrites: Error | null = null;

  seed(entity: Partial<LibraryDocumentEntity> & Pick<LibraryDocumentEntity, 'workspace_id'>): LibraryDocumentEntity {
    const now = new Date().toISOString();
    const row: LibraryDocumentEntity = {
      id: randomUUID(),
      folder_id: null,
      title: 'Doc',
      source_type: 'upload',
      source_id: null,
      storage_key: null,
      mime_type: 'application/pdf',
      byte_size: 1000,
      content_hash: 'a'.repeat(64),
      language: 'unknown',
      status: 'queued',
      status_detail: null,
      page_count: null,
      chunk_count: 0,
      ocr_page_count: 0,
      embedding_model: null,
      last_indexed_at: null,
      source_updated_at: null,
      review_interval_days: null,
      review_due_at: null,
      review_reminded_at: null,
      ingest_job_id: null,
      ingest_attempted_at: null,
      last_ingest_sequence: 0,
      acl_synced_at: null,
      uploaded_at: now,
      created_by: 'u-creator',
      created_at: now,
      updated_at: now,
      scopes: [{ scope_type: 'workspace', scope_ref: entity.workspace_id }],
      access_inherited: false,
      ...entity,
    };
    this.rows.set(row.id, row);
    return row;
  }

  private guard(): void {
    if (this.failWrites) throw this.failWrites;
  }

  async create(input: NewLibraryDocument): Promise<LibraryDocumentEntity> {
    this.guard();
    const now = new Date().toISOString();
    const row: LibraryDocumentEntity = {
      id: randomUUID(),
      workspace_id: input.workspace_id,
      folder_id: input.folder_id,
      title: input.title,
      source_type: input.source_type,
      source_id: null,
      storage_key: input.storage_key,
      mime_type: input.mime_type,
      byte_size: input.byte_size,
      content_hash: input.content_hash,
      language: 'unknown',
      status: 'queued',
      status_detail: input.status_detail,
      page_count: null,
      chunk_count: 0,
      ocr_page_count: 0,
      embedding_model: null,
      last_indexed_at: null,
      source_updated_at: null,
      review_interval_days: input.review_interval_days,
      review_due_at: iso(input.review_due_at),
      review_reminded_at: null,
      ingest_job_id: null,
      ingest_attempted_at: null,
      last_ingest_sequence: 0,
      acl_synced_at: null,
      uploaded_at: iso(input.uploaded_at),
      created_by: input.created_by,
      created_at: now,
      updated_at: now,
      scopes: input.scopes.map((s) => ({ ...s })),
      access_inherited: input.access_inherited,
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async findById(workspaceId: string, id: string): Promise<LibraryDocumentEntity | null> {
    const row = this.rows.get(id);
    return row && row.workspace_id === workspaceId ? { ...row, scopes: row.scopes.map((s) => ({ ...s })) } : null;
  }

  async list(filter: LibraryDocumentFilter): Promise<{ items: LibraryDocumentEntity[]; next_cursor: string | null }> {
    const matching = [...this.rows.values()]
      .filter((row) => row.workspace_id === filter.workspace_id && row.uploaded_at !== null)
      .filter((row) => {
        if (!filter.status) return row.status !== 'deleting';
        if (filter.status === 'reading') return row.status === 'queued' || row.status === 'processing';
        return row.status === filter.status;
      })
      .filter((row) => !filter.used_by || usableBy(row.scopes, filter.used_by))
      .filter((row) => canAccessScopes(filter.access as DocumentAccess, row.scopes))
      .filter((row) => !filter.source_type || row.source_type === filter.source_type)
      .filter((row) => !filter.language || row.language === filter.language)
      .filter((row) => filter.folder_id === undefined || row.folder_id === filter.folder_id)
      .filter((row) => !filter.scope_type || row.scopes.some((s) => s.scope_type === filter.scope_type && (!filter.scope_ref || s.scope_ref === filter.scope_ref)))
      .filter((row) => !filter.q || row.title.toLowerCase().includes(filter.q.toLowerCase()))
      .sort((a, b) => {
        switch (filter.sort) {
          case 'oldest':
            return a.created_at < b.created_at ? -1 : 1;
          case 'name':
            return a.title.localeCompare(b.title);
          case 'size':
            return b.byte_size - a.byte_size;
          default:
            return a.created_at < b.created_at ? 1 : -1;
        }
      });
    const start = filter.cursor ? matching.findIndex((row) => row.id === filter.cursor) + 1 : 0;
    const page = matching.slice(start, start + filter.limit);
    const hasMore = start + filter.limit < matching.length;
    return { items: page.map((row) => ({ ...row })), next_cursor: hasMore ? page[page.length - 1]!.id : null };
  }

  private apply(row: LibraryDocumentEntity, patch: LibraryDocumentPatch): void {
    const { last_indexed_at, review_due_at, review_reminded_at, ingest_attempted_at, acl_synced_at, uploaded_at, ...plain } = patch;
    Object.assign(row, plain);
    if (last_indexed_at !== undefined) row.last_indexed_at = iso(last_indexed_at);
    if (review_due_at !== undefined) row.review_due_at = iso(review_due_at);
    if (review_reminded_at !== undefined) row.review_reminded_at = iso(review_reminded_at);
    if (ingest_attempted_at !== undefined) row.ingest_attempted_at = iso(ingest_attempted_at);
    if (acl_synced_at !== undefined) row.acl_synced_at = iso(acl_synced_at);
    if (uploaded_at !== undefined) row.uploaded_at = iso(uploaded_at);
    row.updated_at = new Date().toISOString();
  }

  async update(workspaceId: string, id: string, patch: LibraryDocumentPatch): Promise<LibraryDocumentEntity> {
    this.guard();
    const row = this.rows.get(id);
    if (!row || row.workspace_id !== workspaceId) throw new Error('document not found');
    this.apply(row, patch);
    return { ...row };
  }

  async replaceScopes(workspaceId: string, id: string, scopes: ScopeRef[]): Promise<void> {
    this.guard();
    const row = this.rows.get(id);
    if (!row || row.workspace_id !== workspaceId) throw new Error('document not found');
    row.scopes = scopes.map((s) => ({ ...s }));
  }

  async applyIngestUpdate(
    workspaceId: string,
    id: string,
    jobId: string,
    sequence: number,
    patch: LibraryDocumentPatch,
  ): Promise<LibraryDocumentEntity | null> {
    const row = this.rows.get(id);
    if (!row || row.workspace_id !== workspaceId) return null;
    if (row.ingest_job_id !== jobId || row.last_ingest_sequence >= sequence) return null;
    this.apply(row, { ...patch, last_ingest_sequence: sequence });
    return { ...row };
  }

  async findDuplicate(workspaceId: string, contentHash: string, scopes: ScopeRef[], excludeId?: string): Promise<LibraryDocumentEntity | null> {
    const found = [...this.rows.values()].find(
      (row) =>
        row.workspace_id === workspaceId &&
        row.id !== excludeId &&
        row.uploaded_at !== null &&
        row.status !== 'deleting' &&
        row.content_hash === contentHash &&
        scopesIntersect(row.scopes, scopes),
    );
    return found ? { ...found } : null;
  }

  async usage(workspaceId: string, monthStart: Date): Promise<LibraryUsage> {
    const docs = [...this.rows.values()].filter((row) => row.workspace_id === workspaceId && row.uploaded_at !== null);
    return {
      documents: docs.length,
      storage_bytes: docs.reduce((sum, row) => sum + row.byte_size, 0),
      ocr_pages_month: docs
        .filter((row) => row.last_indexed_at && new Date(row.last_indexed_at) >= monthStart)
        .reduce((sum, row) => sum + row.ocr_page_count, 0),
    };
  }

  async summary(workspaceId: string, access: DocumentAccess): Promise<LibrarySummaryCounts> {
    const visible = [...this.rows.values()].filter(
      (row) =>
        row.workspace_id === workspaceId &&
        row.uploaded_at !== null &&
        row.status !== 'deleting' &&
        canAccessScopes(access, row.scopes),
    );
    const by_folder: Record<string, number> = {};
    for (const row of visible) {
      if (row.folder_id) by_folder[row.folder_id] = (by_folder[row.folder_id] ?? 0) + 1;
    }
    const count = (...statuses: string[]) => visible.filter((row) => statuses.includes(row.status)).length;
    return {
      total: visible.length,
      by_status: {
        ready: count('ready'),
        reading: count('queued', 'processing'),
        needs_attention: count('needs_attention'),
        failed: count('failed'),
      },
      by_folder,
      in_root: visible.filter((row) => row.folder_id === null).length,
    };
  }

  async knowledgeCounts(workspaceId: string): Promise<LibraryKnowledgeCounts> {
    const ready = [...this.rows.values()].filter(
      (row) => row.workspace_id === workspaceId && row.uploaded_at !== null && row.status === 'ready',
    );
    const specialist_only: Record<string, number> = {};
    let everyone = 0;
    for (const row of ready) {
      if (row.scopes.some((s) => s.scope_type === 'workspace')) {
        everyone += 1;
        continue;
      }
      for (const scope of row.scopes) {
        if (scope.scope_type === 'specialist') {
          specialist_only[scope.scope_ref] = (specialist_only[scope.scope_ref] ?? 0) + 1;
        }
      }
    }
    return { everyone, specialist_only };
  }

  async listInheriting(workspaceId: string, folderId: string): Promise<LibraryDocumentEntity[]> {
    return [...this.rows.values()]
      .filter((row) => row.workspace_id === workspaceId && row.folder_id === folderId && row.access_inherited)
      .map((row) => ({ ...row, scopes: row.scopes.map((s) => ({ ...s })) }));
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    this.guard();
    const row = this.rows.get(id);
    if (row && row.workspace_id === workspaceId) this.rows.delete(id);
  }

  async listReviewDue(now: Date, limit: number): Promise<LibraryDocumentEntity[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.uploaded_at !== null &&
          row.status !== 'deleting' &&
          row.review_due_at !== null &&
          new Date(row.review_due_at) <= now &&
          (row.review_reminded_at === null || row.review_reminded_at < row.review_due_at),
      )
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }
}

export class FakeLibraryFolders implements LibraryFolderRepository {
  readonly rows = new Map<string, LibraryFolderEntity>();
  constructor(private readonly documents?: FakeLibraryDocuments) {}

  async create(input: NewLibraryFolder): Promise<LibraryFolderEntity> {
    const clash = [...this.rows.values()].some(
      (row) => row.workspace_id === input.workspace_id && row.parent_id === input.parent_id && row.name === input.name,
    );
    if (clash) throw new ConflictError('Folder', input.name);
    const now = new Date().toISOString();
    const row: LibraryFolderEntity = {
      id: randomUUID(),
      workspace_id: input.workspace_id,
      parent_id: input.parent_id,
      name: input.name,
      created_by: input.created_by,
      created_at: now,
      updated_at: now,
      scopes: input.scopes.map((s) => ({ ...s })),
    };
    this.rows.set(row.id, row);
    return { ...row };
  }
  async findById(workspaceId: string, id: string): Promise<LibraryFolderEntity | null> {
    const row = this.rows.get(id);
    return row && row.workspace_id === workspaceId ? { ...row, scopes: row.scopes.map((s) => ({ ...s })) } : null;
  }
  async listAll(workspaceId: string): Promise<LibraryFolderEntity[]> {
    return [...this.rows.values()]
      .filter((row) => row.workspace_id === workspaceId)
      .map((row) => ({ ...row, scopes: row.scopes.map((s) => ({ ...s })) }));
  }
  async replaceScopes(workspaceId: string, id: string, scopes: ScopeRef[]): Promise<void> {
    const row = this.rows.get(id);
    if (!row || row.workspace_id !== workspaceId) throw new Error('folder not found');
    row.scopes = scopes.map((s) => ({ ...s }));
  }
  async update(workspaceId: string, id: string, patch: { name?: string; parent_id?: string | null }): Promise<LibraryFolderEntity> {
    const row = this.rows.get(id);
    if (!row || row.workspace_id !== workspaceId) throw new Error('folder not found');
    const next = { ...row, ...patch };
    const clash = [...this.rows.values()].some(
      (other) => other.id !== id && other.workspace_id === workspaceId && other.parent_id === next.parent_id && other.name === next.name,
    );
    if (clash) throw new ConflictError('Folder', next.name);
    Object.assign(row, patch, { updated_at: new Date().toISOString() });
    return { ...row };
  }
  async delete(workspaceId: string, id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.workspace_id === workspaceId) this.rows.delete(id);
  }
  async contentCounts(workspaceId: string, id: string): Promise<{ folders: number; documents: number }> {
    return {
      folders: [...this.rows.values()].filter((row) => row.workspace_id === workspaceId && row.parent_id === id).length,
      // A pending upload counts too: the foreign key blocks the delete either way.
      documents: [...(this.documents?.rows.values() ?? [])].filter(
        (row) => row.workspace_id === workspaceId && row.folder_id === id,
      ).length,
    };
  }
}

export class FakeLibraryEvents implements LibraryIngestEventRepository {
  readonly rows: LibraryIngestEventEntity[] = [];
  async append(event: NewLibraryIngestEvent): Promise<{ inserted: boolean }> {
    if (event.event_id && this.rows.some((row) => row.document_id === event.document_id && row.event_id === event.event_id)) {
      return { inserted: false };
    }
    this.rows.push({ id: randomUUID(), created_at: new Date().toISOString(), ...event });
    return { inserted: true };
  }
  async list(workspaceId: string, documentId: string, limit: number): Promise<LibraryIngestEventEntity[]> {
    return this.rows.filter((row) => row.workspace_id === workspaceId && row.document_id === documentId).slice(0, limit);
  }
}

/**
 * A scriptable stand-in for sineva-ai. By default it behaves like a healthy
 * upstream; tests flip `mode` or script the delete and search answers. It
 * records every call so a test can assert what the platform sent.
 */
export class FakeKnowledgeGateway implements KnowledgeIngestGateway {
  mode: 'ok' | 'unreachable' | 'bad_response' = 'ok';
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  deleteReport: Partial<DeleteReport> = {};
  searchResult: SearchResult = { results: [], abstained: true, abstain_reason: 'no_results_above_threshold' };
  status: Partial<IngestStatusSnapshot> = {};
  preview: TextPreview | null = null;
  aclFails = false;

  private enter(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
    if (this.mode === 'unreachable') throw new UpstreamUnavailableError();
    if (this.mode === 'bad_response') throw new UpstreamServiceError();
  }

  callsTo(method: string): unknown[][] {
    return this.calls.filter((call) => call.method === method).map((call) => call.args);
  }

  async requestIngest(request: IngestRequest, call: KnowledgeCall): Promise<IngestAccepted> {
    this.enter('requestIngest', request, call);
    return { job_id: request.job_id, status: 'queued' };
  }
  async getIngestStatus(jobId: string, tenantId: string, call: KnowledgeCall): Promise<IngestStatusSnapshot> {
    this.enter('getIngestStatus', jobId, tenantId, call);
    return {
      job_id: jobId,
      document_id: 'unknown',
      status: 'processing',
      sequence: 1,
      stage: 'parsing',
      progress: null,
      page_count: null,
      chunk_count: null,
      language: null,
      embedding_model: null,
      ocr_pages: null,
      reason_code: null,
      pages: [],
      personal_data_hint: false,
      ...this.status,
    };
  }
  async requestReindex(request: ReindexRequest, call: KnowledgeCall): Promise<IngestAccepted> {
    this.enter('requestReindex', request, call);
    return { job_id: request.job_id, status: 'queued' };
  }
  async updateAcl(request: AclUpdateRequest, call: KnowledgeCall): Promise<AclUpdateReport> {
    this.enter('updateAcl', request, call);
    if (this.aclFails) throw new UpstreamServiceError();
    return { document_id: request.document_id, acl: request.acl, chunks_updated: 3, re_embedded: false };
  }
  async deleteDocument(tenantId: string, documentId: string, call: KnowledgeCall): Promise<DeleteReport> {
    this.enter('deleteDocument', tenantId, documentId, call);
    return {
      document_id: documentId,
      files_deleted: 1,
      text_deleted: true,
      chunks_deleted: 3,
      vectors_deleted: 3,
      vectors_remaining: 0,
      verified: true,
      ...this.deleteReport,
    };
  }
  async search(request: SearchRequest, call: KnowledgeCall): Promise<SearchResult> {
    this.enter('search', request, call);
    return this.searchResult;
  }
  async getText(request: TextPreviewRequest, call: KnowledgeCall): Promise<TextPreview> {
    this.enter('getText', request, call);
    return (
      this.preview ?? { document_id: request.document_id, page_count: 1, pages: [{ page: 1, text: 'Harga 10.000', ocr: false, readable: true }], next_page: null }
    );
  }
}

export class FakeLibraryLog implements LibraryLog {
  readonly entries: Array<{ event: LibraryLogEvent; fields: LibraryLogFields }> = [];
  warn(event: LibraryLogEvent, fields: LibraryLogFields): void {
    this.entries.push({ event, fields });
  }
}

export class FakeReviewInbox implements LibraryReviewInbox {
  readonly items: Array<{ workspace_id: string; user_id: string; document_id: string; action: string }> = [];
  fails = false;
  async createReviewItem(input: { workspace_id: string; user_id: string; document_id: string; action: 'check_if_still_current' }): Promise<void> {
    if (this.fails) throw new Error('inbox down');
    this.items.push(input);
  }
}

/** A signer that records what it was asked to mint: the token carries no real claims. */
export class FakeContextSigner implements ContextSigner {
  readonly minted: Array<{ context: RequestContext; options: MintContextOptions | undefined }> = [];
  async mint(context: RequestContext, options?: MintContextOptions): Promise<{ token: string; claims: SignedContextClaims }> {
    this.minted.push({ context, options });
    return { token: 'test.context.token', claims: {} as SignedContextClaims };
  }
}

/** Entitlements that deny the listed keys (as `enforced` mode would) and record every check. */
export class RecordingEntitlements implements EntitlementService {
  readonly checks: Array<{ workspace_id: string | null; key: EntitlementKey; quantity?: number }> = [];
  /** Ceilings `numericLimit` reports; empty means "no limit", as in open mode. */
  readonly limits = new Map<EntitlementKey, number>();
  constructor(private readonly denied: ReadonlySet<EntitlementKey> = new Set()) {}
  async check(workspaceId: string | null, key: EntitlementKey, quantity?: number): Promise<EntitlementCheckResult> {
    this.checks.push({ workspace_id: workspaceId, key, quantity });
    return this.denied.has(key)
      ? { allowed: false, reason: 'limit_exceeded', plan_required: 'growth' }
      : { allowed: true, reason: 'open_mode' };
  }
  async assert(workspaceId: string | null, key: EntitlementKey, quantity?: number): Promise<void> {
    const result = await this.check(workspaceId, key, quantity);
    if (!result.allowed) throw new EntitlementRequiredError(key, result.plan_required);
  }
  async numericLimit(_workspaceId: string | null, key: EntitlementKey): Promise<number | null> {
    return this.limits.get(key) ?? null;
  }
}
