import { describe, expect, it } from 'vitest';
import { CreateLibraryDocumentUseCase } from '@/server/application/use-cases/library/create_library_document_use_case';
import { DeleteLibraryDocumentUseCase } from '@/server/application/use-cases/library/delete_library_document_use_case';
import { GetLibraryDocumentUseCase } from '@/server/application/use-cases/library/get_library_document_use_case';
import { ListLibraryDocumentsUseCase } from '@/server/application/use-cases/library/list_library_documents_use_case';
import { PreviewLibraryDocumentUseCase } from '@/server/application/use-cases/library/preview_library_document_use_case';
import { ReindexLibraryDocumentUseCase } from '@/server/application/use-cases/library/reindex_library_document_use_case';
import { UpdateLibraryDocumentUseCase } from '@/server/application/use-cases/library/update_library_document_use_case';
import { ENTITLEMENT_KEYS, EntitlementRequiredError } from '@/server/domain/entitlements/entitlements';
import {
  NotFoundError,
  UpstreamServiceError,
  UpstreamUnavailableError,
} from '@/server/domain/errors/domain_error';
import { InMemoryConversations } from './fakes/in_memory_chat_store';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import { OTHER_USER, OTHER_WS, USER, WS, buildHarness, ctx, uploadAndComplete } from './library_harness';

const memberOf = (specialists: string[]) =>
  ctx({ role: 'member', user_id: OTHER_USER, specialist_scope: 'selected', allowed_specialists: specialists });

describe('notes and chat saves (FR-LIB-12, FR-LIB-13)', () => {
  function conversation(over: Partial<ConversationEntity>): ConversationEntity {
    return {
      id: '33333333-3333-4333-8333-333333333333',
      workspace_id: WS,
      user_id: USER,
      kind: 'hub',
      agent_slug: null,
      title: null,
      title_source: null,
      pinned_at: null,
      archived_at: null,
      origin_message_id: null,
      origin_channel: 'web',
      last_message_at: null,
      created_at: '2026-10-22T00:00:00.000Z',
      updated_at: '2026-10-22T00:00:00.000Z',
      ...over,
    };
  }

  it('stores a note as text, audits it as uploaded and requests ingest', async () => {
    const h = buildHarness();
    const useCase = new CreateLibraryDocumentUseCase({ ...h.deps, conversations: new InMemoryConversations() });
    const doc = await useCase.execute(
      { source_type: 'note', title: 'Jam buka', content: 'Kami tutup hari Minggu.' },
      ctx(),
    );
    expect(doc).toMatchObject({ source_type: 'note', mime_type: 'text/markdown', title: 'Jam buka', status: 'queued' });
    expect(doc.uploaded_at).not.toBeNull();
    expect(new TextDecoder().decode(h.store.objects.get(doc.storage_key!)?.bytes)).toBe('Kami tutup hari Minggu.');
    const request = h.gateway.callsTo('requestIngest')[0]?.[0] as Record<string, unknown>;
    expect(request).toMatchObject({ source_type: 'note', trust_label: 'owner_note', acl: ['workspace'] });
    expect(h.audit.getEvents().map((e) => e.action)).toContain('library.document.uploaded');
  });

  it('flags KTP and NPWP patterns in a note as a hint and still saves it (FR-LIB-26)', async () => {
    const h = buildHarness();
    const useCase = new CreateLibraryDocumentUseCase({ ...h.deps, conversations: new InMemoryConversations() });
    const doc = await useCase.execute(
      { source_type: 'note', title: 'Karyawan', content: 'NIK: 3171234567890001 NPWP 09.254.294.3-407.000' },
      ctx(),
    );
    expect(doc.status_detail).toMatchObject({ personal_data_hint: true });
    expect(doc.uploaded_at).not.toBeNull();
  });

  it('does not set the hint for ordinary text', async () => {
    const h = buildHarness();
    const useCase = new CreateLibraryDocumentUseCase({ ...h.deps, conversations: new InMemoryConversations() });
    const doc = await useCase.execute({ source_type: 'note', title: 'Harga', content: 'Kopi 25.000' }, ctx());
    expect(doc.status_detail?.personal_data_hint ?? false).toBe(false);
  });

  it('chat save defaults the scope to the Room specialist, and to the workspace in the Hub', async () => {
    const h = buildHarness();
    const conversations = new InMemoryConversations();
    conversations.rows.set('44444444-4444-4444-8444-444444444444', conversation({ id: '44444444-4444-4444-8444-444444444444', kind: 'room', agent_slug: 'sinohelp' }));
    conversations.rows.set('55555555-5555-4555-8555-555555555555', conversation({ id: '55555555-5555-4555-8555-555555555555' }));
    const useCase = new CreateLibraryDocumentUseCase({ ...h.deps, conversations });

    const room = await useCase.execute(
      { source_type: 'chat_save', conversation_id: '44444444-4444-4444-8444-444444444444', content: 'Jawaban refund' },
      ctx(),
    );
    expect(room.scopes).toEqual([{ scope_type: 'specialist', scope_ref: 'sinohelp' }]);
    expect(room.source_type).toBe('chat_save');

    const hub = await useCase.execute(
      { source_type: 'chat_save', conversation_id: '55555555-5555-4555-8555-555555555555', content: 'Fakta lain' },
      ctx(),
    );
    expect(hub.scopes).toEqual([{ scope_type: 'workspace', scope_ref: WS }]);
  });

  it("refuses a chat save from someone else's conversation with a 404", async () => {
    const h = buildHarness();
    const conversations = new InMemoryConversations();
    conversations.rows.set('66666666-6666-4666-8666-666666666666', conversation({ id: '66666666-6666-4666-8666-666666666666', user_id: OTHER_USER }));
    const useCase = new CreateLibraryDocumentUseCase({ ...h.deps, conversations });
    await expect(
      useCase.execute({ source_type: 'chat_save', conversation_id: '66666666-6666-4666-8666-666666666666', content: 'x' }, ctx()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a note put failure leaves no row behind', async () => {
    const h = buildHarness();
    h.store.putObject = async () => {
      throw new UpstreamServiceError('The storage service did not complete the request');
    };
    const useCase = new CreateLibraryDocumentUseCase({ ...h.deps, conversations: new InMemoryConversations() });
    await expect(useCase.execute({ source_type: 'note', title: 'a', content: 'b' }, ctx())).rejects.toBeInstanceOf(UpstreamServiceError);
    expect(h.documents.rows.size).toBe(0);
  });
});

describe('listing and reading documents: tenant isolation and specialist access (FR-LIB-15)', () => {
  it('a Member without access to a specialist cannot reach its scoped documents', async () => {
    const h = buildHarness();
    const workspaceDoc = await uploadAndComplete(h, { dto: { file_name: 'w.pdf' } });
    const helpDoc = await uploadAndComplete(h, {
      bytes: new TextEncoder().encode('%PDF-1.4 help'),
      dto: { file_name: 'help.pdf', scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }] },
    });
    const peopleDoc = await uploadAndComplete(h, {
      bytes: new TextEncoder().encode('%PDF-1.4 people'),
      dto: { file_name: 'people.pdf', scopes: [{ scope_type: 'specialist', scope_ref: 'sinopeople' }] },
    });

    const member = memberOf(['sinopeople']);
    const list = await new ListLibraryDocumentsUseCase(h.deps).execute({ limit: 25 }, member);
    expect(list.items.map((d) => d.id).sort()).toEqual([workspaceDoc.id, peopleDoc.id].sort());

    await expect(new GetLibraryDocumentUseCase(h.deps).execute(helpDoc.id, member)).rejects.toBeInstanceOf(NotFoundError);
    await expect(new GetLibraryDocumentUseCase(h.deps).execute(peopleDoc.id, member)).resolves.toMatchObject({ id: peopleDoc.id });
    // The admin with all specialists sees everything.
    const all = await new ListLibraryDocumentsUseCase(h.deps).execute({ limit: 25 }, ctx());
    expect(all.items).toHaveLength(3);
  });

  it('never returns another workspace document, by list or by id', async () => {
    const h = buildHarness();
    const mine = await uploadAndComplete(h);
    const other = ctx({ workspace_id: OTHER_WS });
    expect((await new ListLibraryDocumentsUseCase(h.deps).execute({ limit: 25 }, other)).items).toEqual([]);
    await expect(new GetLibraryDocumentUseCase(h.deps).execute(mine.id, other)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('hides documents that are being deleted unless the status is asked for', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h);
    await h.documents.update(WS, doc.id, { status: 'deleting' });
    const list = new ListLibraryDocumentsUseCase(h.deps);
    expect((await list.execute({ limit: 25 }, ctx())).items).toEqual([]);
    await expect(new GetLibraryDocumentUseCase(h.deps).execute(doc.id, ctx())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('filters by status, scope and title, and pages with a cursor', async () => {
    const h = buildHarness();
    const a = await uploadAndComplete(h, { dto: { file_name: 'alpha.pdf' } });
    await uploadAndComplete(h, { bytes: new TextEncoder().encode('%PDF-1.4 b'), dto: { file_name: 'beta.pdf', scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }] } });
    await h.documents.update(WS, a.id, { status: 'ready' });
    const list = new ListLibraryDocumentsUseCase(h.deps);
    expect((await list.execute({ limit: 25, status: 'ready' }, ctx())).items.map((d) => d.id)).toEqual([a.id]);
    expect((await list.execute({ limit: 25, scope_type: 'specialist', scope_ref: 'sinohelp' }, ctx())).items).toHaveLength(1);
    expect((await list.execute({ limit: 25, q: 'ALPHA' }, ctx())).items.map((d) => d.id)).toEqual([a.id]);
    const first = await list.execute({ limit: 1 }, ctx());
    expect(first.items).toHaveLength(1);
    expect(first.next_cursor).not.toBeNull();
    const second = await list.execute({ limit: 1, cursor: first.next_cursor! }, ctx());
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });
});

describe('updating a document: scope, folder, review interval (FR-LIB-14, FR-LIB-22)', () => {
  it('relabels chunks without re-embedding: audits the scope change and sends only an acl update', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h);
    h.audit.clear();
    const updated = await new UpdateLibraryDocumentUseCase(h.deps).execute(
      doc.id,
      { scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }] },
      ctx(),
    );

    expect(updated.scopes).toEqual([{ scope_type: 'specialist', scope_ref: 'sinohelp' }]);
    expect(h.gateway.callsTo('updateAcl')).toHaveLength(1);
    expect((h.gateway.callsTo('updateAcl')[0]?.[0] as { acl: string[] }).acl).toEqual(['agent:sinohelp']);
    expect(h.gateway.callsTo('requestReindex')).toEqual([]);
    expect(h.gateway.callsTo('requestIngest')).toHaveLength(1); // the original upload only

    const events = h.audit.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'library.document.scope_changed',
      change: { before: { scopes: ['workspace'] }, after: { scopes: ['agent:sinohelp'] } },
    });
    expect(updated.acl_synced_at).not.toBeNull();
  });

  it('keeps the new scopes and a visible "acl not synced" state when sineva-ai fails the relabel', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h);
    h.gateway.aclFails = true;
    await expect(
      new UpdateLibraryDocumentUseCase(h.deps).execute(doc.id, { scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }] }, ctx()),
    ).rejects.toBeInstanceOf(UpstreamServiceError);
    const stored = await h.documents.findById(WS, doc.id);
    expect(stored?.scopes).toEqual([{ scope_type: 'specialist', scope_ref: 'sinohelp' }]);
    expect(stored?.acl_synced_at).toBeNull();
    expect(h.log.entries.map((e) => e.event)).toContain('library.acl_sync_failed');
  });

  it('does not call sineva-ai about a document it never received', async () => {
    const h = buildHarness();
    const doc = h.documents.seed({ workspace_id: WS, ingest_attempted_at: null });
    const updated = await new UpdateLibraryDocumentUseCase(h.deps).execute(
      doc.id,
      { scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }] },
      ctx(),
    );
    expect(h.gateway.calls).toEqual([]);
    expect(updated.acl_synced_at).not.toBeNull();
  });

  it('does nothing and audits nothing when the scopes are the same', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h);
    h.audit.clear();
    await new UpdateLibraryDocumentUseCase(h.deps).execute(doc.id, { scopes: [{ scope_type: 'workspace' }] }, ctx());
    expect(h.audit.getEvents()).toEqual([]);
    expect(h.gateway.callsTo('updateAcl')).toEqual([]);
  });

  it('sets review_due_at from the interval and clears it with null', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h);
    const set = await new UpdateLibraryDocumentUseCase(h.deps).execute(doc.id, { review_interval_days: 90 }, ctx());
    expect(set.review_interval_days).toBe(90);
    expect(set.review_due_at).toBe('2027-01-20T10:00:00.000Z');
    const cleared = await new UpdateLibraryDocumentUseCase(h.deps).execute(doc.id, { review_interval_days: null }, ctx());
    expect(cleared.review_due_at).toBeNull();
  });

  it('renames, moves into a folder and refuses a folder of another workspace', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h);
    const folder = await h.folders.create({ workspace_id: WS, parent_id: null, name: 'SOP', created_by: USER });
    const moved = await new UpdateLibraryDocumentUseCase(h.deps).execute(doc.id, { title: 'Harga baru', folder_id: folder.id }, ctx());
    expect(moved).toMatchObject({ title: 'Harga baru', folder_id: folder.id });
    const foreign = await h.folders.create({ workspace_id: OTHER_WS, parent_id: null, name: 'Theirs', created_by: OTHER_USER });
    await expect(
      new UpdateLibraryDocumentUseCase(h.deps).execute(doc.id, { folder_id: foreign.id }, ctx()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s for a document of another workspace', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h);
    await expect(
      new UpdateLibraryDocumentUseCase(h.deps).execute(doc.id, { title: 'x' }, ctx({ workspace_id: OTHER_WS })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('deleting a document really deletes it (FR-LIB-25)', () => {
  async function ready(h: ReturnType<typeof buildHarness>) {
    const doc = await uploadAndComplete(h);
    return h.documents.update(WS, doc.id, { status: 'ready', chunk_count: 3 });
  }

  it('marks deleting, asks sineva-ai to delete and verify, deletes the file, then removes the rows and audits the counts', async () => {
    const h = buildHarness();
    const doc = await ready(h);
    h.audit.clear();

    const result = await new DeleteLibraryDocumentUseCase(h.deps).execute(doc.id, ctx());

    expect(result).toMatchObject({ id: doc.id, deleted: true, chunks_deleted: 3, vectors_deleted: 3 });
    expect(h.gateway.callsTo('deleteDocument')[0]?.slice(0, 2)).toEqual([WS, doc.id]);
    expect(h.store.deleted).toContain(doc.storage_key);
    expect(h.documents.rows.has(doc.id)).toBe(false);
    expect(h.audit.getEvents()).toHaveLength(1);
    expect(h.audit.getEvents()[0]).toMatchObject({
      action: 'library.document.deleted',
      target_resource_id: doc.id,
      metadata: { chunks_deleted: 3, vectors_deleted: 3, vectors_remaining: 0, files_deleted: 1 },
    });
  });

  it('keeps the document in deleting and answers 502 when a stray vector is left behind', async () => {
    const h = buildHarness();
    const doc = await ready(h);
    h.gateway.deleteReport = { vectors_remaining: 1, verified: false };
    h.audit.clear();

    await expect(new DeleteLibraryDocumentUseCase(h.deps).execute(doc.id, ctx())).rejects.toMatchObject({
      status: 502,
      code: 'delete_unverified',
    });
    expect(h.documents.rows.get(doc.id)?.status).toBe('deleting');
    expect(h.store.deleted).toEqual([]);
    expect(h.audit.getEvents()).toEqual([]);
    expect(h.log.entries.map((e) => e.event)).toContain('library.delete_unverified');
  });

  it('refuses to trust an answer that says verified while still counting vectors', async () => {
    const h = buildHarness();
    const doc = await ready(h);
    h.gateway.deleteReport = { vectors_remaining: 2, verified: true };
    await expect(new DeleteLibraryDocumentUseCase(h.deps).execute(doc.id, ctx())).rejects.toMatchObject({ code: 'delete_unverified' });
    expect(h.documents.rows.has(doc.id)).toBe(true);
  });

  it('stays in deleting when sineva-ai is unreachable, and a retry finishes the job', async () => {
    const h = buildHarness();
    const doc = await ready(h);
    h.gateway.mode = 'unreachable';
    await expect(new DeleteLibraryDocumentUseCase(h.deps).execute(doc.id, ctx())).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(h.documents.rows.get(doc.id)?.status).toBe('deleting');

    h.gateway.mode = 'ok';
    await expect(new DeleteLibraryDocumentUseCase(h.deps).execute(doc.id, ctx())).resolves.toMatchObject({ deleted: true });
    expect(h.documents.rows.has(doc.id)).toBe(false);
  });

  it('keeps the row when the file cannot be deleted, so nothing is orphaned silently', async () => {
    const h = buildHarness();
    const doc = await ready(h);
    h.store.failDelete.add(doc.storage_key!);
    await expect(new DeleteLibraryDocumentUseCase(h.deps).execute(doc.id, ctx())).rejects.toThrow();
    expect(h.documents.rows.get(doc.id)?.status).toBe('deleting');
    expect(h.audit.getEvents().filter((e) => e.action === 'library.document.deleted')).toEqual([]);
  });

  it('skips sineva-ai for a document that was never handed over', async () => {
    const h = buildHarness();
    const doc = h.documents.seed({ workspace_id: WS, ingest_attempted_at: null, storage_key: `t/${WS}/library/x/source` });
    h.store.upload(doc.storage_key!, new Uint8Array([1]));
    await new DeleteLibraryDocumentUseCase(h.deps).execute(doc.id, ctx());
    expect(h.gateway.calls).toEqual([]);
    expect(h.documents.rows.has(doc.id)).toBe(false);
  });

  it('404s for another workspace and for a document the member cannot see', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h, { dto: { scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }] } });
    await expect(new DeleteLibraryDocumentUseCase(h.deps).execute(doc.id, ctx({ workspace_id: OTHER_WS }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(new DeleteLibraryDocumentUseCase(h.deps).execute(doc.id, memberOf(['sinopeople']))).rejects.toBeInstanceOf(NotFoundError);
    expect(h.documents.rows.has(doc.id)).toBe(true);
  });
});

describe('reindex (FR-LIB-24)', () => {
  it('re-requests ingest for a queued document that has no running job', async () => {
    const h = buildHarness();
    h.gateway.mode = 'unreachable';
    const doc = await uploadAndComplete(h);
    h.gateway.mode = 'ok';
    const updated = await new ReindexLibraryDocumentUseCase(h.deps).execute(doc.id, ctx());
    expect(h.gateway.callsTo('requestIngest')).toHaveLength(2);
    expect(updated.status_detail?.reason_code).toBeUndefined();
    expect(updated.ingest_job_id).toBe('00000000-0000-4000-8000-000000000002');
  });

  it('asks for a reindex of an indexed document and audits it', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h);
    await h.documents.update(WS, doc.id, { status: 'ready', chunk_count: 3, last_indexed_at: new Date() });
    h.audit.clear();
    await new ReindexLibraryDocumentUseCase(h.deps).execute(doc.id, ctx());
    expect(h.gateway.callsTo('requestReindex')).toHaveLength(1);
    expect(h.audit.getEvents().map((e) => e.action)).toEqual(['library.document.reindexed']);
  });

  it('polls instead of starting a second job when one is running', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h);
    h.gateway.status = { status: 'processing', sequence: 2, stage: 'parsing', progress: { current: 12, total: 40 } };
    const updated = await new ReindexLibraryDocumentUseCase(h.deps).execute(doc.id, ctx());
    expect(h.gateway.callsTo('getIngestStatus')).toHaveLength(1);
    expect(h.gateway.callsTo('requestIngest')).toHaveLength(1);
    expect(updated.status).toBe('processing');
    expect(updated.status_detail?.progress).toEqual({ current: 12, total: 40 });
  });

  it('throws the upstream error (and records it) when the user asked for a reindex and sineva-ai is down', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h);
    await h.documents.update(WS, doc.id, { status: 'ready', chunk_count: 3, last_indexed_at: new Date() });
    h.gateway.mode = 'unreachable';
    await expect(new ReindexLibraryDocumentUseCase(h.deps).execute(doc.id, ctx())).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect((await h.documents.findById(WS, doc.id))?.status).toBe('queued');
  });

  it('checks the OCR quota before reading a scannable document again, and a hard limit stops it untouched', async () => {
    const allowed = buildHarness();
    const doc = await uploadAndComplete(allowed);
    await allowed.documents.update(WS, doc.id, { status: 'ready', chunk_count: 3, last_indexed_at: new Date() });
    allowed.entitlements.checks.length = 0;
    await new ReindexLibraryDocumentUseCase(allowed.deps).execute(doc.id, ctx());
    expect(allowed.entitlements.checks.map((c) => c.key)).toEqual([ENTITLEMENT_KEYS.OCR_PAGES]);

    const blocked = buildHarness({ denied: [ENTITLEMENT_KEYS.OCR_PAGES] });
    const seeded = blocked.documents.seed({ workspace_id: WS, status: 'ready', chunk_count: 3, last_indexed_at: new Date().toISOString() });
    await expect(new ReindexLibraryDocumentUseCase(blocked.deps).execute(seeded.id, ctx())).rejects.toBeInstanceOf(EntitlementRequiredError);
    expect(blocked.gateway.calls).toEqual([]);
    expect(blocked.documents.rows.get(seeded.id)?.status).toBe('ready');
  });

  it('does not check the OCR quota for a text document', async () => {
    const h = buildHarness();
    const doc = h.documents.seed({ workspace_id: WS, mime_type: 'text/markdown', status: 'ready', chunk_count: 1, last_indexed_at: new Date().toISOString() });
    await new ReindexLibraryDocumentUseCase(h.deps).execute(doc.id, ctx());
    expect(h.entitlements.checks).toEqual([]);
  });

  it('refuses a document that is being deleted', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h);
    await h.documents.update(WS, doc.id, { status: 'deleting' });
    await expect(new ReindexLibraryDocumentUseCase(h.deps).execute(doc.id, ctx())).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('preview of extracted text (FR-LIB-08)', () => {
  it('returns the pages sineva-ai extracted for a ready document, with the signed context', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h);
    await h.documents.update(WS, doc.id, { status: 'ready' });
    const result = await new PreviewLibraryDocumentUseCase(h.deps).execute(doc.id, { page_from: 1, page_to: 20 }, ctx());
    expect(result.pages[0]).toMatchObject({ page: 1, readable: true });
    expect(h.gateway.callsTo('getText')[0]?.[0]).toEqual({ tenant_id: WS, document_id: doc.id, page_from: 1, page_to: 20 });
  });

  it('answers 409 preview_not_ready while the document is still queued', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h);
    await expect(
      new PreviewLibraryDocumentUseCase(h.deps).execute(doc.id, { page_from: 1, page_to: 20 }, ctx()),
    ).rejects.toMatchObject({ status: 409, code: 'preview_not_ready' });
    expect(h.gateway.callsTo('getText')).toEqual([]);
  });

  it('does not reach a document the member cannot see', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h, { dto: { scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }] } });
    await h.documents.update(WS, doc.id, { status: 'ready' });
    await expect(
      new PreviewLibraryDocumentUseCase(h.deps).execute(doc.id, { page_from: 1, page_to: 20 }, memberOf(['sinopeople'])),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
