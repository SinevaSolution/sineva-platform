import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ContextSigner, MintContextOptions } from '@/server/domain/context/signed_context';
import type { EntitlementService } from '@/server/domain/entitlements/entitlements';
import { CANONICAL_SPECIALIST_SLUGS } from '@/server/domain/chat/specialist_catalog';
import {
  DomainError,
  ForbiddenError,
  NotFoundError,
  UpstreamUnavailableError,
  ValidationError,
} from '@/server/domain/errors/domain_error';
import type { KnowledgeCall, KnowledgeIngestGateway } from '@/server/domain/library/knowledge_ingest_gateway';
import type { LibrarySourceType } from '@/server/domain/library/library';
import {
  canAccessScopes,
  documentAccessFor,
  principalsForScopes,
  type ScopeRef,
} from '@/server/domain/library/library_access';
import type {
  LibraryDocumentEntity,
  LibraryFolderEntity,
  LibraryStatusDetail,
} from '@/server/domain/library/library_entities';
import type { LibraryLog } from '@/server/domain/library/library_ports';
import type {
  LibraryDocumentRepository,
  LibraryFolderRepository,
  LibraryIngestEventRepository,
} from '@/server/domain/repositories/library_repository';
import type { ObjectStore } from '@/server/domain/repositories/object_store';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { LibraryScopeInput } from '@/server/application/dtos/library_dto';
import type { LibraryDocumentPatch } from '@/server/domain/repositories/library_repository';

export interface LibraryDeps {
  documents: LibraryDocumentRepository;
  folders: LibraryFolderRepository;
  events: LibraryIngestEventRepository;
  gateway: KnowledgeIngestGateway;
  contextSigner: ContextSigner;
  store: ObjectStore;
  audit: AuditLogger;
  entitlements: EntitlementService;
  transactions: TransactionRunner;
  log: LibraryLog;
  /** Correlation id of an ingest job. Not a database id: it is sent to sineva-ai. */
  newJobId: () => string;
  now: () => Date;
}

/** Reason codes the platform itself writes into `status_detail`. */
export const INGEST_UNAVAILABLE = 'ingest_service_unavailable';
export const INGEST_ERROR = 'ingest_service_error';

/** First instant of the month in UTC: the window of the OCR page quota. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function requireWorkspace(context: RequestContext): string {
  if (!context.workspace_id) {
    throw new ValidationError('Workspace context is required', [
      { code: 'required', field: 'workspace_id', detail: 'Workspace context is required' },
    ]);
  }
  return context.workspace_id;
}

export async function mintCall(
  deps: Pick<LibraryDeps, 'contextSigner'>,
  context: RequestContext,
  options?: MintContextOptions,
): Promise<KnowledgeCall> {
  const { token } = await deps.contextSigner.mint(context, options);
  return { context_token: token, request_id: context.request_id };
}

/** How much sineva-ai should trust the text (FR-LIB-21). */
export function trustLabelFor(sourceType: LibrarySourceType): string {
  switch (sourceType) {
    case 'upload':
      return 'owner_upload';
    case 'note':
    case 'chat_save':
      return 'owner_note';
    case 'url':
    case 'crawl':
      return 'crawled';
    case 'sync':
      return 'synced';
    case 'ai_tool':
      return 'external_tool';
  }
}

/**
 * Turns the scopes a client asked for into stored scopes. The workspace scope
 * stores the workspace id as its reference so the unique index never sees a
 * null. A member limited to selected specialists can only target those.
 */
export function resolveScopes(
  input: LibraryScopeInput[] | undefined,
  context: RequestContext,
  defaults: ScopeRef[] = [],
): ScopeRef[] {
  const workspaceId = requireWorkspace(context);
  const requested: LibraryScopeInput[] | undefined = input && input.length > 0 ? input : undefined;
  if (!requested) {
    return defaults.length > 0 ? defaults : [{ scope_type: 'workspace', scope_ref: workspaceId }];
  }
  const scopes = new Map<string, ScopeRef>();
  for (const scope of requested) {
    if (scope.scope_type === 'workspace') {
      scopes.set('workspace', { scope_type: 'workspace', scope_ref: workspaceId });
      continue;
    }
    const slug = scope.scope_ref.toLowerCase().trim();
    // The orchestrator `sino` has no scope of its own: it reads workspace documents.
    if (!CANONICAL_SPECIALIST_SLUGS.has(slug) || slug === 'sino') {
      throw new ValidationError('Unknown specialist', [
        { code: 'unknown_specialist', field: 'scopes', detail: 'scope_ref is not a known specialist' },
      ]);
    }
    if (context.specialist_scope === 'selected' && !(context.allowed_specialists ?? []).includes(slug)) {
      throw new ForbiddenError(`Access to specialist '${slug}' is restricted for this member`);
    }
    scopes.set(`specialist:${slug}`, { scope_type: 'specialist', scope_ref: slug });
  }
  return [...scopes.values()];
}

/**
 * Loads a collection the caller may use. A missing one, another workspace's
 * and one whose access excludes a restricted member all give the same 404, so
 * a hidden collection is not disclosed by trying to put something into it.
 * Null in, null out: the top level has no collection.
 */
export async function loadVisibleFolder(
  folders: LibraryFolderRepository,
  context: RequestContext,
  folderId: string | null | undefined,
): Promise<LibraryFolderEntity | null> {
  if (!folderId) {
    return null;
  }
  const folder = await folders.findById(requireWorkspace(context), folderId);
  if (!folder || !canAccessScopes(documentAccessFor(context), folder.scopes)) {
    throw new NotFoundError('Library folder', folderId);
  }
  return folder;
}

/** What a new document gets when nobody chose: its collection's access, or Everyone at the top level. */
export function inheritedScopes(folder: LibraryFolderEntity | null, context: RequestContext): ScopeRef[] {
  return folder && folder.scopes.length > 0
    ? folder.scopes.map((scope) => ({ ...scope }))
    : [{ scope_type: 'workspace', scope_ref: requireWorkspace(context) }];
}

/**
 * Gives a document new scopes and tells sineva-ai: the rows and the audit
 * event in one transaction, the ACL relabel after it (never a re-read,
 * FR-LIB-14). `extra` rides in the same write (inherit flag, folder, title).
 * When the relabel fails the scopes stay saved and `acl_synced_at` stays null,
 * so the state is visible and the same call or a reindex repairs it; the
 * failure is rethrown for the caller to decide (a user PATCH surfaces it, a
 * collection-wide change logs it and carries on).
 */
export async function applyDocumentScopes(
  deps: LibraryDeps,
  context: RequestContext,
  document: LibraryDocumentEntity,
  nextScopes: ScopeRef[],
  extra: LibraryDocumentPatch = {},
): Promise<LibraryDocumentEntity> {
  const { documents, audit, transactions, gateway, log } = deps;
  const workspaceId = requireWorkspace(context);
  const before = principalsForScopes(document.scopes);
  const after = principalsForScopes(nextScopes);
  const changed = before.join('|') !== after.join('|');
  const now = deps.now();
  const patch: LibraryDocumentPatch = { ...extra };

  const saved = await transactions.run(async () => {
    if (changed) {
      await documents.replaceScopes(workspaceId, document.id, nextScopes);
      // The acl in sineva-ai is stale until the relabel below succeeds; the
      // null makes that visible instead of implicit.
      patch.acl_synced_at = null;
      await audit.log({
        action: 'library.document.scope_changed',
        context,
        target_resource_type: 'library_document',
        target_resource_id: document.id,
        change: { before: { scopes: before }, after: { scopes: after } },
      });
    }
    return Object.keys(patch).length > 0 ? documents.update(workspaceId, document.id, patch) : document;
  });
  if (!changed) {
    return saved;
  }
  if (document.ingest_attempted_at === null) {
    // Nothing was ever sent to sineva-ai, so there are no chunks to relabel.
    return documents.update(workspaceId, document.id, { acl_synced_at: now });
  }
  try {
    await gateway.updateAcl(
      { tenant_id: workspaceId, document_id: document.id, acl: after },
      await mintCall(deps, context),
    );
  } catch (error) {
    if (error instanceof DomainError) {
      log.warn('library.acl_sync_failed', { workspace_id: workspaceId, document_id: document.id, status: error.status });
    }
    throw error;
  }
  return documents.update(workspaceId, document.id, { acl_synced_at: now });
}

/**
 * Loads a document the caller may see. Another workspace's, a pending upload,
 * a scoped document the member has no access to and a missing one all give the
 * same 404, so existence is not disclosed. `deleting` documents are hidden
 * except to the delete retry.
 */
export async function resolveVisibleDocument(
  documents: LibraryDocumentRepository,
  context: RequestContext,
  id: string,
  options: { allowDeleting?: boolean } = {},
): Promise<LibraryDocumentEntity> {
  const workspaceId = requireWorkspace(context);
  const document = await documents.findById(workspaceId, id);
  if (
    !document ||
    document.uploaded_at === null ||
    (document.status === 'deleting' && !options.allowDeleting) ||
    !canAccessScopes(documentAccessFor(context), document.scopes)
  ) {
    throw new NotFoundError('Library document', id);
  }
  return document;
}

function keepHint(document: LibraryDocumentEntity): LibraryStatusDetail | null {
  return document.status_detail?.personal_data_hint ? { personal_data_hint: true } : null;
}

export interface IngestStart {
  document: LibraryDocumentEntity;
  /** The upstream failure, when the hand-over did not happen. The document is still saved and queued. */
  failure: DomainError | null;
}

/**
 * Hands a stored document to sineva-ai. The job id is chosen here and saved
 * before the call, so a callback that arrives before the answer still finds
 * its job, and so a document whose request timed out is known to have been
 * attempted (delete then calls sineva-ai instead of assuming nothing exists).
 * An unreachable or misbehaving sineva-ai does not throw: the document stays
 * `queued` with a reason and an ingest event, never `ready`.
 */
export async function startIngest(
  deps: LibraryDeps,
  document: LibraryDocumentEntity,
  context: RequestContext,
  mode: 'ingest' | 'reindex',
  reindexReason: 'manual' | 'embedding_model_changed' = 'manual',
): Promise<IngestStart> {
  const workspaceId = requireWorkspace(context);
  const jobId = deps.newJobId();
  let current = await deps.documents.update(workspaceId, document.id, {
    ingest_job_id: jobId,
    last_ingest_sequence: 0,
    ingest_attempted_at: deps.now(),
    status: 'queued',
    status_detail: keepHint(document),
  });
  const call = await mintCall(deps, context);
  const acl = principalsForScopes(current.scopes);

  try {
    if (mode === 'ingest') {
      await deps.gateway.requestIngest(
        {
          tenant_id: workspaceId,
          document_id: current.id,
          job_id: jobId,
          storage_key: current.storage_key ?? '',
          mime_type: current.mime_type,
          byte_size: current.byte_size,
          content_hash: current.content_hash,
          source_type: current.source_type,
          trust_label: trustLabelFor(current.source_type),
          acl,
        },
        call,
      );
    } else {
      await deps.gateway.requestReindex(
        { tenant_id: workspaceId, document_id: current.id, job_id: jobId, acl, reason: reindexReason },
        call,
      );
    }
    await deps.events.append({
      document_id: current.id,
      workspace_id: workspaceId,
      event_id: null,
      job_id: jobId,
      sequence: null,
      stage: 'ingest_requested',
      outcome: 'accepted',
      status: null,
      detail: null,
      applied: true,
    });
    // The acl travelled with the request, so the chunks start with the right labels.
    current = await deps.documents.update(workspaceId, current.id, { acl_synced_at: deps.now() });
    return { document: current, failure: null };
  } catch (error) {
    if (!(error instanceof DomainError)) {
      throw error;
    }
    const reason = error instanceof UpstreamUnavailableError ? INGEST_UNAVAILABLE : INGEST_ERROR;
    await deps.events.append({
      document_id: current.id,
      workspace_id: workspaceId,
      event_id: null,
      job_id: jobId,
      sequence: null,
      stage: 'ingest_requested',
      outcome: 'failed',
      status: null,
      detail: { reason_code: reason },
      applied: true,
    });
    current = await deps.documents.update(workspaceId, current.id, {
      status_detail: { ...keepHint(document), reason_code: reason },
    });
    deps.log.warn('library.ingest_request_failed', { workspace_id: workspaceId, document_id: current.id, reason, status: error.status });
    return { document: current, failure: error };
  }
}
