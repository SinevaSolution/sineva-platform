import { describe, expect, it } from 'vitest';
import { ModeEntitlementService } from '@/server/application/entitlements/mode_entitlement_service';
import { CompleteLibraryUploadUseCase } from '@/server/application/use-cases/library/complete_library_upload_use_case';
import { RequestLibraryUploadUseCase } from '@/server/application/use-cases/library/request_library_upload_use_case';
import { ListLibraryDocumentsUseCase } from '@/server/application/use-cases/library/list_library_documents_use_case';
import { ENTITLEMENT_KEYS, EntitlementRequiredError } from '@/server/domain/entitlements/entitlements';
import {
  ForbiddenError,
  NotFoundError,
  UpstreamServiceError,
  ValidationError,
} from '@/server/domain/errors/domain_error';
import { AlreadyInLibraryError } from '@/server/domain/library/library_errors';
import type { ObjectStore } from '@/server/domain/repositories/object_store';
import {
  OTHER_USER,
  OTHER_WS,
  PDF_BYTES,
  WS,
  ZIP_BYTES,
  buildHarness,
  ctx,
  sha256Hex,
  uploadAndComplete,
  uploadDto,
} from './library_harness';

describe('presigned upload request (FR-LIB-06, FR-LIB-07)', () => {
  it('presigns a PUT pinned to type and length, under the tenant prefix, and records a pending row', async () => {
    const h = buildHarness();
    const ticket = await new RequestLibraryUploadUseCase(h.deps).execute(uploadDto(), ctx());

    expect(ticket).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, max_bytes: 25 * 1024 * 1024 });
    expect(ticket.upload_url).toContain(`t/${WS}/library/${ticket.document_id}/source`);
    expect(h.store.presigns).toEqual([
      { key: `t/${WS}/library/${ticket.document_id}/source`, content_type: 'application/pdf', size_bytes: PDF_BYTES.length },
    ]);
    const row = await h.documents.findById(WS, ticket.document_id);
    expect(row).toMatchObject({ uploaded_at: null, status: 'queued', created_by: ctx().user_id, source_type: 'upload' });
  });

  it('a pending upload is not a document yet: lists hide it', async () => {
    const h = buildHarness();
    await new RequestLibraryUploadUseCase(h.deps).execute(uploadDto(), ctx());
    const list = await new ListLibraryDocumentsUseCase(h.deps).execute({ limit: 25 }, ctx());
    expect(list.items).toEqual([]);
  });

  it.each([
    ['an unsupported extension', { file_name: 'movie.mp4', content_type: 'video/mp4' }],
    ['a content type that does not match the extension', { content_type: 'image/png' }],
    ['a file over 25 MB', { byte_size: 25 * 1024 * 1024 + 1 }],
    ['an empty file', { byte_size: 0 }],
    ['a malformed hash', { sha256: 'xyz' }],
  ])('rejects %s before presigning anything', async (_label, extra) => {
    const h = buildHarness();
    await expect(new RequestLibraryUploadUseCase(h.deps).execute(uploadDto(extra), ctx())).rejects.toBeInstanceOf(ValidationError);
    expect(h.store.presigns).toEqual([]);
    expect(h.documents.rows.size).toBe(0);
  });

  it('presign errors surface as a 502 and never return an unsigned URL (FR-LIB-07)', async () => {
    const h = buildHarness();
    const failingStore: ObjectStore = {
      ...h.store,
      createPresignedPut: async () => {
        throw new UpstreamServiceError('The storage service did not complete the request');
      },
      getObject: h.store.getObject.bind(h.store),
      putObject: h.store.putObject.bind(h.store),
      deleteObject: h.store.deleteObject.bind(h.store),
    };
    const useCase = new RequestLibraryUploadUseCase({ ...h.deps, store: failingStore });
    const error = await useCase.execute(uploadDto(), ctx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamServiceError);
    expect((error as UpstreamServiceError).status).toBe(502);
    // The half-created row is removed, so a failed presign leaves nothing behind.
    expect(h.documents.rows.size).toBe(0);
  });

  it('flags an identical file in the same scope as "Already in your Library" with the existing id (FR-LIB-07)', async () => {
    const h = buildHarness();
    const first = await uploadAndComplete(h);
    const error = await new RequestLibraryUploadUseCase(h.deps).execute(uploadDto(), ctx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AlreadyInLibraryError);
    expect((error as AlreadyInLibraryError).details[0]?.detail).toBe(first.id);
    expect((error as AlreadyInLibraryError).status).toBe(409);
  });

  it('does not flag the same bytes in a different scope, or in another workspace', async () => {
    const h = buildHarness();
    await uploadAndComplete(h);
    await expect(
      new RequestLibraryUploadUseCase(h.deps).execute(
        uploadDto({ scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }] }),
        ctx(),
      ),
    ).resolves.toBeDefined();
    await expect(
      new RequestLibraryUploadUseCase(h.deps).execute(uploadDto(), ctx({ workspace_id: OTHER_WS })),
    ).resolves.toBeDefined();
  });

  it('checks the document and storage quotas through the entitlement seam, and the OCR quota for scannable types (FR-LIB-27)', async () => {
    const h = buildHarness();
    await uploadAndComplete(h);
    h.entitlements.checks.length = 0;
    await new RequestLibraryUploadUseCase(h.deps).execute(
      uploadDto({ file_name: 'b.pdf', sha256: sha256Hex(new TextEncoder().encode('other')) }),
      ctx(),
    );
    const keys = h.entitlements.checks.map((c) => c.key);
    expect(keys).toEqual([ENTITLEMENT_KEYS.DOCUMENTS, ENTITLEMENT_KEYS.STORAGE_MB, ENTITLEMENT_KEYS.OCR_PAGES]);
    expect(h.entitlements.checks[0]).toMatchObject({ workspace_id: WS, quantity: 2 });
    expect(h.entitlements.checks[1]?.quantity).toBe(1);
  });

  it('skips the OCR quota for a text file', async () => {
    const h = buildHarness();
    await new RequestLibraryUploadUseCase(h.deps).execute(
      uploadDto({ file_name: 'a.txt', content_type: 'text/plain' }),
      ctx(),
    );
    expect(h.entitlements.checks.map((c) => c.key)).not.toContain(ENTITLEMENT_KEYS.OCR_PAGES);
  });

  it('logs the quota checks in open mode and still lets the upload through', async () => {
    const h = buildHarness();
    const events: Array<Record<string, unknown>> = [];
    const open = new ModeEntitlementService('open', { resolve: async () => null }, (event) => events.push(event));
    await new RequestLibraryUploadUseCase({ ...h.deps, entitlements: open }).execute(uploadDto(), ctx());
    expect(events.map((e) => e.key)).toEqual([
      ENTITLEMENT_KEYS.DOCUMENTS,
      ENTITLEMENT_KEYS.STORAGE_MB,
      ENTITLEMENT_KEYS.OCR_PAGES,
    ]);
    expect(events.every((e) => e.event === 'entitlement.checked' && e.allowed === true)).toBe(true);
  });

  it('a hard limit pauses the new upload and never touches an existing document (FR-LIB-27)', async () => {
    const h = buildHarness();
    const existing = await uploadAndComplete(h);
    const blocked = buildHarness({ denied: [ENTITLEMENT_KEYS.DOCUMENTS] });
    blocked.documents.rows.set(existing.id, existing);
    await expect(
      new RequestLibraryUploadUseCase(blocked.deps).execute(
        uploadDto({ sha256: sha256Hex(new TextEncoder().encode('different')) }),
        ctx(),
      ),
    ).rejects.toBeInstanceOf(EntitlementRequiredError);
    expect(blocked.store.presigns).toEqual([]);
    expect(blocked.store.deleted).toEqual([]);
    expect(blocked.documents.rows.size).toBe(1);
    expect(blocked.documents.rows.get(existing.id)?.status).toBe('queued');
  });

  it('a member limited to selected specialists cannot target another specialist', async () => {
    const h = buildHarness();
    const restricted = ctx({ role: 'member', specialist_scope: 'selected', allowed_specialists: ['sinopeople'] });
    await expect(
      new RequestLibraryUploadUseCase(h.deps).execute(
        uploadDto({ scopes: [{ scope_type: 'specialist', scope_ref: 'sinofinance' }] }),
        restricted,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      new RequestLibraryUploadUseCase(h.deps).execute(
        uploadDto({ scopes: [{ scope_type: 'specialist', scope_ref: 'sinopeople' }] }),
        restricted,
      ),
    ).resolves.toBeDefined();
  });

  it('rejects an unknown specialist slug and a folder from another workspace', async () => {
    const h = buildHarness();
    await expect(
      new RequestLibraryUploadUseCase(h.deps).execute(uploadDto({ scopes: [{ scope_type: 'specialist', scope_ref: 'sino-evil' }] }), ctx()),
    ).rejects.toBeInstanceOf(ValidationError);
    const foreign = await h.folders.create({ workspace_id: OTHER_WS, parent_id: null, name: 'Theirs', created_by: OTHER_USER, scopes: [{ scope_type: 'workspace', scope_ref: OTHER_WS }] });
    await expect(
      new RequestLibraryUploadUseCase(h.deps).execute(uploadDto({ folder_id: foreign.id }), ctx()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('completing an upload (FR-LIB-07, FR-LIB-25, audit)', () => {
  it('verifies the stored object, audits the upload and requests ingest with the platform-computed acl', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h, { dto: { scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }] } });

    expect(doc.uploaded_at).not.toBeNull();
    expect(doc.status).toBe('queued');
    expect(doc.ingest_job_id).toBe('00000000-0000-4000-8000-000000000001');
    expect(doc.ingest_attempted_at).not.toBeNull();

    const [request, call] = h.gateway.callsTo('requestIngest')[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(request).toEqual({
      tenant_id: WS,
      document_id: doc.id,
      job_id: doc.ingest_job_id,
      storage_key: `t/${WS}/library/${doc.id}/source`,
      mime_type: 'application/pdf',
      byte_size: PDF_BYTES.length,
      content_hash: sha256Hex(PDF_BYTES),
      source_type: 'upload',
      trust_label: 'owner_upload',
      acl: ['agent:sinohelp'],
    });
    expect(call.context_token).toBe('test.context.token');
    expect(h.signer.minted[0]?.context.workspace_id).toBe(WS);

    const audit = h.audit.getEvents().filter((e) => e.action === 'library.document.uploaded');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ target_resource_type: 'library_document', target_resource_id: doc.id });
    // Ids, counts and codes only: no file name, no title.
    expect(JSON.stringify(audit[0]?.metadata)).not.toContain('price list');
  });

  it('keeps the document queued with an honest reason when sineva-ai is unreachable, and never says ready', async () => {
    const h = buildHarness();
    h.gateway.mode = 'unreachable';
    const doc = await uploadAndComplete(h);

    expect(doc.status).toBe('queued');
    expect(doc.status_detail).toMatchObject({ reason_code: 'ingest_service_unavailable' });
    expect(h.events.rows.map((e) => [e.stage, e.outcome])).toContainEqual(['ingest_requested', 'failed']);
    expect(h.log.entries.map((e) => e.event)).toContain('library.ingest_request_failed');
    // The file is stored and audited: only the hand-over is pending.
    expect(h.audit.getEvents().map((e) => e.action)).toContain('library.document.uploaded');
  });

  it('records a bad answer from sineva-ai as a different reason code', async () => {
    const h = buildHarness();
    h.gateway.mode = 'bad_response';
    const doc = await uploadAndComplete(h);
    expect(doc.status).toBe('queued');
    expect(doc.status_detail).toMatchObject({ reason_code: 'ingest_service_error' });
  });

  it('answers 409 upload_not_found when the browser never put the object', async () => {
    const h = buildHarness();
    const useCase = new RequestLibraryUploadUseCase(h.deps);
    const ticket = await useCase.execute(uploadDto(), ctx());
    await expect(new CompleteLibraryUploadUseCase(h.deps).execute(ticket.document_id, ctx())).rejects.toMatchObject({
      status: 409,
      code: 'upload_not_found',
    });
  });

  it.each([
    ['a different hash than declared', PDF_BYTES, { sha256: sha256Hex(new TextEncoder().encode('lie')) }, 'hash_mismatch'],
    ['a different size than declared', PDF_BYTES, { byte_size: PDF_BYTES.length + 1 }, 'size_mismatch'],
    ['a ZIP declared as a PDF', ZIP_BYTES, {}, 'file_content_mismatch'],
  ])('rejects %s, removes the object and the row, so it cannot be retried into acceptance', async (_label, bytes, dto, code) => {
    const h = buildHarness();
    const request = new RequestLibraryUploadUseCase(h.deps);
    const ticket = await request.execute(uploadDto({ byte_size: bytes.length, sha256: sha256Hex(bytes), ...dto }), ctx());
    const row = await h.documents.findById(WS, ticket.document_id);
    h.store.upload(row!.storage_key!, bytes);

    const error = await new CompleteLibraryUploadUseCase(h.deps).execute(ticket.document_id, ctx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details[0]?.code).toBe(code);
    expect(h.store.objects.has(row!.storage_key!)).toBe(false);
    expect(h.documents.rows.size).toBe(0);
    expect(h.gateway.callsTo('requestIngest')).toEqual([]);
  });

  it('hides another member pending upload: only the uploader can complete it', async () => {
    const h = buildHarness();
    const ticket = await new RequestLibraryUploadUseCase(h.deps).execute(uploadDto(), ctx());
    const row = await h.documents.findById(WS, ticket.document_id);
    h.store.upload(row!.storage_key!, PDF_BYTES);
    await expect(
      new CompleteLibraryUploadUseCase(h.deps).execute(ticket.document_id, ctx({ user_id: OTHER_USER })),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      new CompleteLibraryUploadUseCase(h.deps).execute(ticket.document_id, ctx({ workspace_id: OTHER_WS })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('is idempotent: completing twice audits once and asks sineva-ai once', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h);
    await new CompleteLibraryUploadUseCase(h.deps).execute(doc.id, ctx());
    expect(h.audit.getEvents().filter((e) => e.action === 'library.document.uploaded')).toHaveLength(1);
    expect(h.gateway.callsTo('requestIngest')).toHaveLength(1);
  });

  it('re-checks duplicates with the server-computed hash and removes the loser', async () => {
    const h = buildHarness();
    const request = new RequestLibraryUploadUseCase(h.deps);
    const a = await request.execute(uploadDto(), ctx());
    const b = await request.execute(uploadDto(), ctx());
    for (const ticket of [a, b]) {
      const row = await h.documents.findById(WS, ticket.document_id);
      h.store.upload(row!.storage_key!, PDF_BYTES);
    }
    await new CompleteLibraryUploadUseCase(h.deps).execute(a.document_id, ctx());
    await expect(new CompleteLibraryUploadUseCase(h.deps).execute(b.document_id, ctx())).rejects.toBeInstanceOf(
      AlreadyInLibraryError,
    );
    expect(await h.documents.findById(WS, b.document_id)).toBeNull();
    expect(h.store.objects.has(`t/${WS}/library/${b.document_id}/source`)).toBe(false);
  });
});
