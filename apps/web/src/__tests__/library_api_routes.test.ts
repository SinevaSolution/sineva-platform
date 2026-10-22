import { installHeaderSessionResolver } from './fakes/header_session_resolver';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as uploadsRoute from '@/app/api/v1/workspaces/[workspace_id]/library/uploads/route';
import * as documentsRoute from '@/app/api/v1/workspaces/[workspace_id]/library/documents/route';
import * as documentRoute from '@/app/api/v1/workspaces/[workspace_id]/library/documents/[document_id]/route';
import * as completeRoute from '@/app/api/v1/workspaces/[workspace_id]/library/documents/[document_id]/complete/route';
import * as reindexRoute from '@/app/api/v1/workspaces/[workspace_id]/library/documents/[document_id]/reindex/route';
import * as previewRoute from '@/app/api/v1/workspaces/[workspace_id]/library/documents/[document_id]/preview/route';
import * as foldersRoute from '@/app/api/v1/workspaces/[workspace_id]/library/folders/route';
import * as folderRoute from '@/app/api/v1/workspaces/[workspace_id]/library/folders/[folder_id]/route';
import * as tryRoute from '@/app/api/v1/workspaces/[workspace_id]/library/try/route';
import * as usageRoute from '@/app/api/v1/workspaces/[workspace_id]/library/usage/route';
import * as summaryRoute from '@/app/api/v1/workspaces/[workspace_id]/library/summary/route';
import * as knowledgeRoute from '@/app/api/v1/workspaces/[workspace_id]/library/knowledge/route';
import { CompleteLibraryUploadUseCase } from '@/server/application/use-cases/library/complete_library_upload_use_case';
import { CreateLibraryDocumentUseCase } from '@/server/application/use-cases/library/create_library_document_use_case';
import { CreateLibraryFolderUseCase } from '@/server/application/use-cases/library/create_library_folder_use_case';
import { DeleteLibraryDocumentUseCase } from '@/server/application/use-cases/library/delete_library_document_use_case';
import { DeleteLibraryFolderUseCase } from '@/server/application/use-cases/library/delete_library_folder_use_case';
import { GetLibraryDocumentUseCase } from '@/server/application/use-cases/library/get_library_document_use_case';
import { GetLibraryKnowledgeUseCase } from '@/server/application/use-cases/library/get_library_knowledge_use_case';
import { GetLibrarySummaryUseCase } from '@/server/application/use-cases/library/get_library_summary_use_case';
import { GetLibraryUsageUseCase } from '@/server/application/use-cases/library/get_library_usage_use_case';
import { ListLibraryDocumentsUseCase } from '@/server/application/use-cases/library/list_library_documents_use_case';
import { ListLibraryFoldersUseCase } from '@/server/application/use-cases/library/list_library_folders_use_case';
import { PreviewLibraryDocumentUseCase } from '@/server/application/use-cases/library/preview_library_document_use_case';
import { ReindexLibraryDocumentUseCase } from '@/server/application/use-cases/library/reindex_library_document_use_case';
import { RequestLibraryUploadUseCase } from '@/server/application/use-cases/library/request_library_upload_use_case';
import { TryLibraryRetrievalUseCase } from '@/server/application/use-cases/library/try_library_retrieval_use_case';
import { UpdateLibraryDocumentUseCase } from '@/server/application/use-cases/library/update_library_document_use_case';
import { UpdateLibraryFolderUseCase } from '@/server/application/use-cases/library/update_library_folder_use_case';
import { UpstreamServiceError } from '@/server/domain/errors/domain_error';
import * as container from '@/server/container';
import { InMemoryConversations } from './fakes/in_memory_chat_store';
import { OTHER_WS, PDF_BYTES, WS, buildHarness, sha256Hex, type LibraryHarness } from './library_harness';

installHeaderSessionResolver();

const DOC = '77777777-7777-4777-8777-777777777777';
const FOLDER = '88888888-8888-4888-8888-888888888888';
const base = (workspace = WS) => `https://app.sineva.id/api/v1/workspaces/${workspace}/library`;

// Route handlers differ only in their params type; the tests pass whatever the URL implies.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (request: NextRequest, context: any) => Promise<Response>;

interface RouteCase {
  name: string;
  handler: RouteHandler;
  method: string;
  path: string;
  body?: unknown;
  /** The lowest-privilege role that must be refused, or null when every role may call it. */
  deniedRole: 'viewer' | 'member' | null;
}

const CASES: RouteCase[] = [
  { name: 'POST uploads', handler: uploadsRoute.POST, method: 'POST', path: '/uploads', body: {}, deniedRole: 'viewer' },
  { name: 'GET documents', handler: documentsRoute.GET, method: 'GET', path: '/documents', deniedRole: null },
  { name: 'POST documents', handler: documentsRoute.POST, method: 'POST', path: '/documents', body: {}, deniedRole: 'viewer' },
  { name: 'GET document', handler: documentRoute.GET, method: 'GET', path: `/documents/${DOC}`, deniedRole: null },
  { name: 'PATCH document', handler: documentRoute.PATCH, method: 'PATCH', path: `/documents/${DOC}`, body: { title: 'x' }, deniedRole: 'member' },
  { name: 'DELETE document', handler: documentRoute.DELETE, method: 'DELETE', path: `/documents/${DOC}`, deniedRole: 'member' },
  { name: 'POST complete', handler: completeRoute.POST, method: 'POST', path: `/documents/${DOC}/complete`, deniedRole: 'viewer' },
  { name: 'POST reindex', handler: reindexRoute.POST, method: 'POST', path: `/documents/${DOC}/reindex`, deniedRole: 'member' },
  { name: 'GET preview', handler: previewRoute.GET, method: 'GET', path: `/documents/${DOC}/preview`, deniedRole: null },
  { name: 'GET folders', handler: foldersRoute.GET, method: 'GET', path: '/folders', deniedRole: null },
  { name: 'POST folders', handler: foldersRoute.POST, method: 'POST', path: '/folders', body: { name: 'x' }, deniedRole: 'member' },
  { name: 'PATCH folder', handler: folderRoute.PATCH, method: 'PATCH', path: `/folders/${FOLDER}`, body: { name: 'y' }, deniedRole: 'member' },
  { name: 'DELETE folder', handler: folderRoute.DELETE, method: 'DELETE', path: `/folders/${FOLDER}`, deniedRole: 'member' },
  { name: 'POST try', handler: tryRoute.POST, method: 'POST', path: '/try', body: { query: 'x' }, deniedRole: 'member' },
  { name: 'GET usage', handler: usageRoute.GET, method: 'GET', path: '/usage', deniedRole: 'member' },
  { name: 'GET summary', handler: summaryRoute.GET, method: 'GET', path: '/summary', deniedRole: null },
  { name: 'GET knowledge', handler: knowledgeRoute.GET, method: 'GET', path: '/knowledge', deniedRole: null },
];

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-test-session-user-id': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'x-test-session-role': 'admin',
    'x-test-session-workspaces': WS,
    ...extra,
  };
}

function call(
  handler: RouteCase['handler'],
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string>; workspace?: string } = {},
) {
  const workspace = options.workspace ?? WS;
  const url = `${base(workspace)}${path}`;
  const segments = path.split('/').filter(Boolean);
  const params: Record<string, string> = { workspace_id: workspace };
  if (segments[0] === 'documents' && segments[1]) params.document_id = segments[1];
  if (segments[0] === 'folders' && segments[1]) params.folder_id = segments[1];
  const request = new NextRequest(url, {
    method,
    headers: headers(options.headers),
    ...(options.body !== undefined ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) } : {}),
  });
  return handler(request, { params: Promise.resolve(params) });
}

let h: LibraryHarness;
let conversations: InMemoryConversations;

beforeEach(() => {
  vi.restoreAllMocks();
  h = buildHarness();
  conversations = new InMemoryConversations();
  const deps = h.deps;
  vi.spyOn(container, 'getRequestLibraryUploadUseCase').mockReturnValue(new RequestLibraryUploadUseCase(deps));
  vi.spyOn(container, 'getCompleteLibraryUploadUseCase').mockReturnValue(new CompleteLibraryUploadUseCase(deps));
  vi.spyOn(container, 'getCreateLibraryDocumentUseCase').mockReturnValue(new CreateLibraryDocumentUseCase({ ...deps, conversations }));
  vi.spyOn(container, 'getListLibraryDocumentsUseCase').mockReturnValue(new ListLibraryDocumentsUseCase(deps));
  vi.spyOn(container, 'getGetLibraryDocumentUseCase').mockReturnValue(new GetLibraryDocumentUseCase(deps));
  vi.spyOn(container, 'getUpdateLibraryDocumentUseCase').mockReturnValue(new UpdateLibraryDocumentUseCase(deps));
  vi.spyOn(container, 'getDeleteLibraryDocumentUseCase').mockReturnValue(new DeleteLibraryDocumentUseCase(deps));
  vi.spyOn(container, 'getReindexLibraryDocumentUseCase').mockReturnValue(new ReindexLibraryDocumentUseCase(deps));
  vi.spyOn(container, 'getPreviewLibraryDocumentUseCase').mockReturnValue(new PreviewLibraryDocumentUseCase(deps));
  vi.spyOn(container, 'getTryLibraryRetrievalUseCase').mockReturnValue(new TryLibraryRetrievalUseCase(deps));
  vi.spyOn(container, 'getGetLibraryUsageUseCase').mockReturnValue(new GetLibraryUsageUseCase(deps));
  vi.spyOn(container, 'getGetLibrarySummaryUseCase').mockReturnValue(new GetLibrarySummaryUseCase(deps));
  vi.spyOn(container, 'getGetLibraryKnowledgeUseCase').mockReturnValue(new GetLibraryKnowledgeUseCase(deps));
  vi.spyOn(container, 'getCreateLibraryFolderUseCase').mockReturnValue(new CreateLibraryFolderUseCase(deps));
  vi.spyOn(container, 'getListLibraryFoldersUseCase').mockReturnValue(new ListLibraryFoldersUseCase(deps));
  vi.spyOn(container, 'getUpdateLibraryFolderUseCase').mockReturnValue(new UpdateLibraryFolderUseCase(deps));
  vi.spyOn(container, 'getDeleteLibraryFolderUseCase').mockReturnValue(new DeleteLibraryFolderUseCase(deps));
});

describe.each(CASES)('$name: guards (401, 403, cross-workspace 404)', (route) => {
  it('returns 401 without a session', async () => {
    const res = await call(route.handler, route.method, route.path, {
      body: route.body,
      headers: { 'x-test-unauthenticated': 'true' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 for a workspace the caller is not a member of, never 403', async () => {
    const res = await call(route.handler, route.method, route.path, { body: route.body, workspace: OTHER_WS });
    expect(res.status).toBe(404);
  });

  if (route.deniedRole) {
    it(`returns 403 for the ${route.deniedRole} role`, async () => {
      const res = await call(route.handler, route.method, route.path, {
        body: route.body,
        headers: { 'x-test-session-role': route.deniedRole! },
      });
      expect(res.status).toBe(403);
    });
  }
});

describe('upload, complete, read, scope change and delete through the routes', () => {
  async function upload(extra: Record<string, unknown> = {}) {
    const res = await call(uploadsRoute.POST, 'POST', '/uploads', {
      body: {
        file_name: 'harga.pdf',
        content_type: 'application/pdf',
        byte_size: PDF_BYTES.length,
        sha256: sha256Hex(PDF_BYTES),
        ...extra,
      },
    });
    return { res, json: await res.json() };
  }

  it('presigns (201), completes (200) and serves a view without storage internals', async () => {
    const { res, json } = await upload();
    expect(res.status).toBe(201);
    expect(json.data).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'application/pdf' } });
    const documentId = json.data.document_id as string;

    const stored = await h.documents.findById(WS, documentId);
    h.store.upload(stored!.storage_key!, PDF_BYTES);
    const done = await call(completeRoute.POST, 'POST', `/documents/${documentId}/complete`);
    const doneJson = await done.json();
    expect(done.status).toBe(200);
    expect(doneJson.data).toMatchObject({ id: documentId, status: 'queued', source_type: 'upload', acl_sync_pending: false });
    const raw = JSON.stringify(doneJson);
    expect(raw).not.toContain('storage_key');
    expect(raw).not.toContain('content_hash');
    expect(raw).not.toContain('ingest_job_id');
    expect(raw).not.toContain(WS + '/library');

    const list = await (await call(documentsRoute.GET, 'GET', '/documents')).json();
    expect(list.data.items.map((d: { id: string }) => d.id)).toEqual([documentId]);
    expect(list.data.items[0].scopes).toEqual([{ scope_type: 'workspace', scope_ref: null }]);

    const patched = await call(documentRoute.PATCH, 'PATCH', `/documents/${documentId}`, {
      body: { scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }], review_interval_days: 90 },
    });
    expect(patched.status).toBe(200);
    expect((await patched.json()).data).toMatchObject({
      scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }],
      review_interval_days: 90,
    });

    // A member limited to another specialist no longer reaches it.
    const hidden = await call(documentRoute.GET, 'GET', `/documents/${documentId}`, {
      headers: {
        'x-test-session-role': 'member',
        'x-test-specialist-scope': 'selected',
        'x-test-session-specialists': 'sinopeople',
      },
    });
    expect(hidden.status).toBe(404);

    const removed = await call(documentRoute.DELETE, 'DELETE', `/documents/${documentId}`);
    expect(removed.status).toBe(200);
    expect((await removed.json()).data).toMatchObject({ id: documentId, deleted: true });
    expect((await call(documentRoute.GET, 'GET', `/documents/${documentId}`)).status).toBe(404);
  });

  it('answers 409 already_in_library with the existing document id', async () => {
    const first = await upload();
    const documentId = first.json.data.document_id as string;
    const stored = await h.documents.findById(WS, documentId);
    h.store.upload(stored!.storage_key!, PDF_BYTES);
    await call(completeRoute.POST, 'POST', `/documents/${documentId}/complete`);

    const again = await upload();
    expect(again.res.status).toBe(409);
    expect(again.json.errors[0]).toMatchObject({ code: 'already_in_library', detail: documentId });
  });

  it('answers 502 when the storage presign fails, with no upload url', async () => {
    h.store.createPresignedPut = async () => {
      throw new UpstreamServiceError('The storage service did not complete the request');
    };
    const { res, json } = await upload();
    expect(res.status).toBe(502);
    expect(JSON.stringify(json)).not.toContain('upload_url');
  });

  it('answers 409 preview_not_ready for a queued document and serves the preview once ready', async () => {
    const created = await upload();
    const documentId = created.json.data.document_id as string;
    const stored = await h.documents.findById(WS, documentId);
    h.store.upload(stored!.storage_key!, PDF_BYTES);
    await call(completeRoute.POST, 'POST', `/documents/${documentId}/complete`);

    const early = await call(previewRoute.GET, 'GET', `/documents/${documentId}/preview`);
    expect(early.status).toBe(409);
    expect((await early.json()).errors[0].code).toBe('preview_not_ready');

    await h.documents.update(WS, documentId, { status: 'ready' });
    const ready = await call(previewRoute.GET, 'GET', `/documents/${documentId}/preview?page_from=1&page_to=5`);
    expect(ready.status).toBe(200);
    expect((await ready.json()).data).toMatchObject({ document_id: documentId, status: 'ready' });
    expect(h.gateway.callsTo('getText')[0]?.[0]).toMatchObject({ page_from: 1, page_to: 5 });
  });

  it('reindex answers 202 with the document', async () => {
    const created = await upload();
    const documentId = created.json.data.document_id as string;
    const stored = await h.documents.findById(WS, documentId);
    h.store.upload(stored!.storage_key!, PDF_BYTES);
    h.gateway.mode = 'unreachable';
    await call(completeRoute.POST, 'POST', `/documents/${documentId}/complete`);
    h.gateway.mode = 'ok';
    const res = await call(reindexRoute.POST, 'POST', `/documents/${documentId}/reindex`);
    expect(res.status).toBe(202);
  });
});

describe('validation: 422 and no identity from the body (R-27)', () => {
  it.each([
    ['uploads with no sha256', uploadsRoute.POST, '/uploads', { file_name: 'a.pdf', content_type: 'application/pdf', byte_size: 1 }],
    ['uploads with a workspace_id in the body', uploadsRoute.POST, '/uploads', { file_name: 'a.pdf', content_type: 'application/pdf', byte_size: 1, sha256: 'a'.repeat(64), workspace_id: OTHER_WS }],
    ['uploads with a path in the file name', uploadsRoute.POST, '/uploads', { file_name: '../a.pdf', content_type: 'application/pdf', byte_size: 1, sha256: 'a'.repeat(64) }],
    ['uploads over 25 MB', uploadsRoute.POST, '/uploads', { file_name: 'a.pdf', content_type: 'application/pdf', byte_size: 26 * 1024 * 1024, sha256: 'a'.repeat(64) }],
    ['uploads with a squad scope', uploadsRoute.POST, '/uploads', { file_name: 'a.pdf', content_type: 'application/pdf', byte_size: 1, sha256: 'a'.repeat(64), scopes: [{ scope_type: 'squad', scope_ref: 'x' }] }],
    ['a url document (M2)', documentsRoute.POST, '/documents', { source_type: 'url', url: 'https://example.com' }],
    ['a note with no content', documentsRoute.POST, '/documents', { source_type: 'note', title: 'x' }],
    ['an empty document patch', documentRoute.PATCH, `/documents/${DOC}`, {}],
    ['a document patch naming the status', documentRoute.PATCH, `/documents/${DOC}`, { status: 'ready' }],
    ['a folder name with a slash', foldersRoute.POST, '/folders', { name: 'a/b' }],
    ['an empty folder patch', folderRoute.PATCH, `/folders/${FOLDER}`, {}],
    ['a try with too large top_k', tryRoute.POST, '/try', { query: 'x', top_k: 99 }],
    ['a try that brings its own principals', tryRoute.POST, '/try', { query: 'x', principals: ['workspace', 'agent:sinofinance'] }],
    ['malformed json', uploadsRoute.POST, '/uploads', '{nope'],
  ])('rejects %s with 422 before any use case runs', async (_label, handler, path, body) => {
    const method = handler === documentRoute.PATCH || handler === folderRoute.PATCH ? 'PATCH' : 'POST';
    const res = await call(handler as RouteCase['handler'], method, path, { body });
    expect(res.status).toBe(422);
    expect(h.documents.rows.size).toBe(0);
    expect(h.store.presigns).toEqual([]);
  });

  it('rejects a bad list filter with 422', async () => {
    expect((await call(documentsRoute.GET, 'GET', '/documents?status=ready;drop')).status).toBe(422);
    expect((await call(documentsRoute.GET, 'GET', '/documents?limit=0')).status).toBe(422);
    expect((await call(documentsRoute.GET, 'GET', '/documents?cursor=not-a-uuid')).status).toBe(422);
  });
});

describe('folders, try and usage through the routes', () => {
  it('creates, lists, renames and refuses to delete a non-empty folder with 409', async () => {
    const created = await call(foldersRoute.POST, 'POST', '/folders', { body: { name: 'SOP' } });
    expect(created.status).toBe(201);
    const folder = (await created.json()).data;
    const child = await call(foldersRoute.POST, 'POST', '/folders', { body: { name: 'HR', parent_id: folder.id } });
    expect(child.status).toBe(201);

    const list = await (await call(foldersRoute.GET, 'GET', '/folders')).json();
    expect(list.data.items).toHaveLength(2);

    const renamed = await call(folderRoute.PATCH, 'PATCH', `/folders/${folder.id}`, { body: { name: 'Prosedur' } });
    expect((await renamed.json()).data.name).toBe('Prosedur');

    const refused = await call(folderRoute.DELETE, 'DELETE', `/folders/${folder.id}`);
    expect(refused.status).toBe(409);
    expect((await refused.json()).errors[0].code).toBe('folder_not_empty');

    const dup = await call(foldersRoute.POST, 'POST', '/folders', { body: { name: 'Prosedur' } });
    expect(dup.status).toBe(409);
  });

  it('try computes the scope on the server and returns the passages', async () => {
    const res = await call(tryRoute.POST, 'POST', '/try', { body: { query: 'harga kopi', agent_slug: 'sinohelp' } });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ abstained: true, principals: ['workspace', 'agent:sinohelp'] });
  });

  it('try answers 503 when sineva-ai is unreachable and never a canned result', async () => {
    h.gateway.mode = 'unreachable';
    const res = await call(tryRoute.POST, 'POST', '/try', { body: { query: 'x' } });
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('results');
  });

  it('usage returns counts', async () => {
    const res = await call(usageRoute.GET, 'GET', '/usage');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ documents: 0, storage_bytes: 0, ocr_pages_month: 0 });
  });

  it('creates a note through POST documents with 201', async () => {
    const res = await call(documentsRoute.POST, 'POST', '/documents', {
      body: { source_type: 'note', title: 'Jam buka', content: 'Senin sampai Sabtu.' },
    });
    expect(res.status).toBe(201);
    expect((await res.json()).data).toMatchObject({ source_type: 'note', title: 'Jam buka' });
  });
});

describe('collections, access and counts through the routes (ADR-0033)', () => {
  it('creates a collection with chosen access and serves it without internals', async () => {
    const res = await call(foldersRoute.POST, 'POST', '/folders', {
      body: { name: 'Pricing', scopes: [{ scope_type: 'specialist', scope_ref: 'sinosales' }] },
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data).toMatchObject({ name: 'Pricing', scopes: [{ scope_type: 'specialist', scope_ref: 'sinosales' }] });
    const list = await (await call(foldersRoute.GET, 'GET', '/folders')).json();
    expect(list.data.items[0].scopes).toEqual([{ scope_type: 'specialist', scope_ref: 'sinosales' }]);
  });

  it('rejects the reserved workflow scope with 422 on folders and documents', async () => {
    const scopes = [{ scope_type: 'workflow', scope_ref: '77777777-7777-4777-8777-777777777777' }];
    expect((await call(foldersRoute.POST, 'POST', '/folders', { body: { name: 'x', scopes } })).status).toBe(422);
    expect((await call(folderRoute.PATCH, 'PATCH', `/folders/${FOLDER}`, { body: { scopes } })).status).toBe(422);
    expect((await call(documentRoute.PATCH, 'PATCH', `/documents/${DOC}`, { body: { scopes } })).status).toBe(422);
  });

  it('answers 422 unknown_squad for a squad scope that is not an active squad of the workspace', async () => {
    const scopes = [{ scope_type: 'squad', scope_ref: '77777777-7777-4777-8777-777777777777' }];
    const res = await call(foldersRoute.POST, 'POST', '/folders', { body: { name: 'x', scopes } });
    expect(res.status).toBe(422);
    expect((await res.json()).errors[0]).toMatchObject({ code: 'unknown_squad' });
  });

  it('rejects scopes together with inherit_access', async () => {
    const res = await call(documentRoute.PATCH, 'PATCH', `/documents/${DOC}`, {
      body: { inherit_access: true, scopes: [{ scope_type: 'workspace' }] },
    });
    expect(res.status).toBe(422);
  });

  it('serves the summary and what each companion knows', async () => {
    h.documents.seed({ workspace_id: WS, status: 'ready', scopes: [{ scope_type: 'workspace', scope_ref: WS }] });
    h.documents.seed({ workspace_id: WS, status: 'ready', scopes: [{ scope_type: 'specialist', scope_ref: 'sinosales' }] });
    const summary = await (await call(summaryRoute.GET, 'GET', '/summary')).json();
    expect(summary.data).toMatchObject({ total: 2, by_status: { ready: 2, reading: 0 }, in_root: 2 });
    const knows = await (await call(knowledgeRoute.GET, 'GET', '/knowledge')).json();
    expect(knows.data.everyone).toBe(1);
    expect(knows.data.specialists.sinosales).toBe(2);
    expect(knows.data.specialists.sinohelp).toBe(1);
  });

  it('rejects an unknown used_by and sort on the list', async () => {
    expect((await call(documentsRoute.GET, 'GET', '/documents?used_by=nobody')).status).toBe(422);
    expect((await call(documentsRoute.GET, 'GET', '/documents?sort=random')).status).toBe(422);
  });
});
