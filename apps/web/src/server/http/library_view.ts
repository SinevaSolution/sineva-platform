import type { LibraryDocumentView, LibraryFolderView, LibraryScopeView } from '@/shared/library_view';
import type { ScopeRef } from '../domain/library/library_access';
import type { LibraryDocumentEntity, LibraryFolderEntity } from '../domain/library/library_entities';

/**
 * The one place a document entity becomes wire JSON. It leaves out the storage
 * key, the content hash and the ingest bookkeeping on purpose: a browser has no
 * use for them, and the storage key would reveal the bucket layout.
 */
function toScopeViews(scopes: ScopeRef[]): LibraryScopeView[] {
  return scopes.map((scope) => ({
    scope_type: scope.scope_type,
    // The workspace scope stores the workspace id as its reference; the client has no use for it.
    scope_ref: scope.scope_type === 'workspace' ? null : scope.scope_ref,
  }));
}

export function toLibraryDocumentView(entity: LibraryDocumentEntity): LibraryDocumentView {
  return {
    id: entity.id,
    folder_id: entity.folder_id,
    title: entity.title,
    source_type: entity.source_type,
    mime_type: entity.mime_type,
    byte_size: entity.byte_size,
    language: entity.language,
    status: entity.status,
    status_detail: entity.status_detail,
    page_count: entity.page_count,
    chunk_count: entity.chunk_count,
    embedding_model: entity.embedding_model,
    last_indexed_at: entity.last_indexed_at,
    source_updated_at: entity.source_updated_at,
    review_interval_days: entity.review_interval_days,
    review_due_at: entity.review_due_at,
    scopes: toScopeViews(entity.scopes),
    acl_sync_pending: entity.ingest_attempted_at !== null && entity.acl_synced_at === null,
    access_inherited: entity.access_inherited,
    created_by: entity.created_by,
    created_at: entity.created_at,
    updated_at: entity.updated_at,
  };
}

export function toLibraryFolderView(entity: LibraryFolderEntity): LibraryFolderView {
  return {
    id: entity.id,
    parent_id: entity.parent_id,
    name: entity.name,
    scopes: toScopeViews(entity.scopes),
    created_at: entity.created_at,
    updated_at: entity.updated_at,
  };
}
