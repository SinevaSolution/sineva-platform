import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RepositoryAuditLogger } from '@/server/application/audit/repository_audit_logger';
import type { LibraryDeps } from '@/server/application/library/library_support';
import { ApplyIngestEventUseCase } from '@/server/application/use-cases/library/apply_ingest_event_use_case';
import { CompleteLibraryUploadUseCase } from '@/server/application/use-cases/library/complete_library_upload_use_case';
import { DeleteLibraryDocumentUseCase } from '@/server/application/use-cases/library/delete_library_document_use_case';
import { RequestLibraryUploadUseCase } from '@/server/application/use-cases/library/request_library_upload_use_case';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ConflictError } from '@/server/domain/errors/domain_error';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';
import { PrismaAuditRepository } from '@/server/infrastructure/database/prisma_audit_repository';
import { PrismaLibraryDocumentRepository } from '@/server/infrastructure/database/prisma_library_document_repository';
import { PrismaLibraryFolderRepository } from '@/server/infrastructure/database/prisma_library_folder_repository';
import { PrismaLibraryIngestEventRepository } from '@/server/infrastructure/database/prisma_library_ingest_event_repository';
import { PrismaTransactionRunner } from '@/server/infrastructure/database/prisma_transaction_runner';
import { FakeObjectStore } from '../fakes/fake_object_store';
import { allowAllEntitlements } from '../fakes/allow_all_entitlements';
import { FakeContextSigner, FakeKnowledgeGateway, FakeLibraryLog } from '../fakes/library_fakes';
import { PDF_BYTES, sha256Hex } from '../library_harness';

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
const documents = new PrismaLibraryDocumentRepository(prisma);
const folders = new PrismaLibraryFolderRepository(prisma);
const events = new PrismaLibraryIngestEventRepository(prisma);
const transactions = new PrismaTransactionRunner(prisma);

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedWorkspace(slug: string) {
  const user = await prisma.user.create({ data: { email: `${slug}@sineva.id`, full_name: 'Owner' } });
  const workspace = await prisma.workspace.create({
    data: { workspace_slug: slug, workspace_name: slug, owner_user_id: user.id },
  });
  return { user, workspace };
}

async function seedDocument(
  workspaceId: string,
  userId: string,
  over: { hash?: string; scopes?: Array<{ scope_type: 'workspace' | 'specialist'; scope_ref: string }>; uploaded?: boolean; folder_id?: string | null } = {},
) {
  return documents.create({
    workspace_id: workspaceId,
    folder_id: over.folder_id ?? null,
    title: 'Daftar harga',
    source_type: 'upload',
    storage_key: null,
    mime_type: 'application/pdf',
    byte_size: 1000,
    content_hash: over.hash ?? 'a'.repeat(64),
    status_detail: null,
    review_interval_days: null,
    review_due_at: null,
    uploaded_at: over.uploaded === false ? null : new Date(),
    access_inherited: false,
    created_by: userId,
    scopes: over.scopes ?? [{ scope_type: 'workspace', scope_ref: workspaceId }],
  });
}

describe('library documents (Prisma)', () => {
  it('stores a document with its scopes and reads it back only inside its workspace (tenant canary)', async () => {
    const a = await seedWorkspace('lib-a');
    const b = await seedWorkspace('lib-b');
    const doc = await seedDocument(a.workspace.id, a.user.id, {
      scopes: [
        { scope_type: 'workspace', scope_ref: a.workspace.id },
        { scope_type: 'specialist', scope_ref: 'sinohelp' },
      ],
    });
    expect(doc.status).toBe('queued');
    expect(doc.scopes).toHaveLength(2);

    expect(await documents.findById(a.workspace.id, doc.id)).not.toBeNull();
    // Canary: the same id read as another tenant is simply not found, by every path.
    expect(await documents.findById(b.workspace.id, doc.id)).toBeNull();
    expect((await documents.list({ workspace_id: b.workspace.id, access: { all: true }, limit: 25 })).items).toEqual([]);
    expect(await documents.findDuplicate(b.workspace.id, doc.content_hash, doc.scopes)).toBeNull();
    expect(await documents.usage(b.workspace.id, new Date(0))).toEqual({ documents: 0, storage_bytes: 0, ocr_pages_month: 0 });
    await expect(documents.update(b.workspace.id, doc.id, { title: 'stolen' })).rejects.toThrow();
    await documents.delete(b.workspace.id, doc.id);
    expect(await documents.findById(a.workspace.id, doc.id)).not.toBeNull();
    await expect(documents.replaceScopes(b.workspace.id, doc.id, [])).rejects.toThrow();
  });

  it('filters the list by member access and hides pending uploads and documents being deleted', async () => {
    const { user, workspace } = await seedWorkspace('lib-list');
    const shared = await seedDocument(workspace.id, user.id, { hash: '1'.repeat(64) });
    const help = await seedDocument(workspace.id, user.id, {
      hash: '2'.repeat(64),
      scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }],
    });
    const people = await seedDocument(workspace.id, user.id, {
      hash: '3'.repeat(64),
      scopes: [{ scope_type: 'specialist', scope_ref: 'sinopeople' }],
    });
    await seedDocument(workspace.id, user.id, { hash: '4'.repeat(64), uploaded: false });
    const gone = await seedDocument(workspace.id, user.id, { hash: '5'.repeat(64) });
    await documents.update(workspace.id, gone.id, { status: 'deleting' });

    const all = await documents.list({ workspace_id: workspace.id, access: { all: true }, limit: 25 });
    expect(all.items.map((d) => d.id).sort()).toEqual([shared.id, help.id, people.id].sort());

    const restricted = await documents.list({
      workspace_id: workspace.id,
      access: { all: false, specialists: ['sinopeople'] },
      limit: 25,
    });
    expect(restricted.items.map((d) => d.id).sort()).toEqual([shared.id, people.id].sort());

    const byScope = await documents.list({
      workspace_id: workspace.id,
      access: { all: true },
      scope_type: 'specialist',
      scope_ref: 'sinohelp',
      limit: 25,
    });
    expect(byScope.items.map((d) => d.id)).toEqual([help.id]);

    const page = await documents.list({ workspace_id: workspace.id, access: { all: true }, limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.next_cursor).not.toBeNull();
    const next = await documents.list({ workspace_id: workspace.id, access: { all: true }, limit: 2, cursor: page.next_cursor! });
    expect(next.items).toHaveLength(1);
    expect(next.next_cursor).toBeNull();
  });

  it('finds an identical hash only when a scope is shared', async () => {
    const { user, workspace } = await seedWorkspace('lib-dup');
    const doc = await seedDocument(workspace.id, user.id, { hash: '9'.repeat(64) });
    const workspaceScope = [{ scope_type: 'workspace' as const, scope_ref: workspace.id }];
    expect((await documents.findDuplicate(workspace.id, doc.content_hash, workspaceScope))?.id).toBe(doc.id);
    expect(await documents.findDuplicate(workspace.id, doc.content_hash, workspaceScope, doc.id)).toBeNull();
    expect(
      await documents.findDuplicate(workspace.id, doc.content_hash, [{ scope_type: 'specialist', scope_ref: 'sinohelp' }]),
    ).toBeNull();
  });

  it('counts documents, bytes and this month OCR pages', async () => {
    const { user, workspace } = await seedWorkspace('lib-usage');
    const doc = await seedDocument(workspace.id, user.id, { hash: '6'.repeat(64) });
    await seedDocument(workspace.id, user.id, { hash: '7'.repeat(64), uploaded: false });
    await documents.update(workspace.id, doc.id, { ocr_page_count: 8, last_indexed_at: new Date() });
    const usage = await documents.usage(workspace.id, new Date(Date.now() - 86_400_000));
    expect(usage).toEqual({ documents: 1, storage_bytes: 1000, ocr_pages_month: 8 });
    expect((await documents.usage(workspace.id, new Date(Date.now() + 86_400_000))).ocr_pages_month).toBe(0);
  });

  it('applies an ingest update only for the current job and a higher sequence, also under a race', async () => {
    const { user, workspace } = await seedWorkspace('lib-cas');
    const doc = await seedDocument(workspace.id, user.id);
    const job = '30000000-0000-4000-8000-000000000001';
    await documents.update(workspace.id, doc.id, { ingest_job_id: job });

    expect(await documents.applyIngestUpdate(workspace.id, doc.id, '99999999-9999-4999-8999-999999999999', 1, { status: 'ready' })).toBeNull();
    expect((await documents.applyIngestUpdate(workspace.id, doc.id, job, 2, { status: 'processing' }))?.status).toBe('processing');
    expect(await documents.applyIngestUpdate(workspace.id, doc.id, job, 2, { status: 'ready' })).toBeNull();
    expect(await documents.applyIngestUpdate(workspace.id, doc.id, job, 1, { status: 'ready' })).toBeNull();

    // Two callbacks racing: the higher sequence wins whatever the order.
    const results = await Promise.all([
      documents.applyIngestUpdate(workspace.id, doc.id, job, 5, { status: 'ready' }),
      documents.applyIngestUpdate(workspace.id, doc.id, job, 4, { status: 'processing' }),
    ]);
    const stored = await documents.findById(workspace.id, doc.id);
    expect(stored?.last_ingest_sequence).toBe(5);
    expect(stored?.status).toBe('ready');
    expect(results[0]).not.toBeNull();
  });

  it('round-trips status_detail including a clear back to null', async () => {
    const { user, workspace } = await seedWorkspace('lib-detail');
    const doc = await seedDocument(workspace.id, user.id);
    const set = await documents.update(workspace.id, doc.id, {
      status_detail: { reason_code: 'unreadable_pages', pages: [3, 7], personal_data_hint: true },
    });
    expect(set.status_detail).toEqual({ reason_code: 'unreadable_pages', pages: [3, 7], personal_data_hint: true });
    expect((await documents.update(workspace.id, doc.id, { status_detail: null })).status_detail).toBeNull();
  });

  it('replaces scopes atomically inside a transaction and rolls back with it', async () => {
    const { user, workspace } = await seedWorkspace('lib-scopes');
    const doc = await seedDocument(workspace.id, user.id);
    await expect(
      transactions.run(async () => {
        await documents.replaceScopes(workspace.id, doc.id, [{ scope_type: 'specialist', scope_ref: 'sinohelp' }]);
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect((await documents.findById(workspace.id, doc.id))?.scopes).toEqual([{ scope_type: 'workspace', scope_ref: workspace.id }]);

    await transactions.run(() => documents.replaceScopes(workspace.id, doc.id, [{ scope_type: 'specialist', scope_ref: 'sinohelp' }]));
    expect((await documents.findById(workspace.id, doc.id))?.scopes).toEqual([{ scope_type: 'specialist', scope_ref: 'sinohelp' }]);
  });

  it('lists review reminders that are due and not yet sent for that due date', async () => {
    const { user, workspace } = await seedWorkspace('lib-review');
    const due = new Date(Date.now() - 86_400_000);
    const pending = await seedDocument(workspace.id, user.id, { hash: 'b'.repeat(64) });
    const reminded = await seedDocument(workspace.id, user.id, { hash: 'c'.repeat(64) });
    const future = await seedDocument(workspace.id, user.id, { hash: 'd'.repeat(64) });
    const deleting = await seedDocument(workspace.id, user.id, { hash: 'e'.repeat(64) });
    await documents.update(workspace.id, pending.id, { review_due_at: due });
    await documents.update(workspace.id, reminded.id, { review_due_at: due, review_reminded_at: new Date() });
    await documents.update(workspace.id, future.id, { review_due_at: new Date(Date.now() + 86_400_000) });
    await documents.update(workspace.id, deleting.id, { review_due_at: due, status: 'deleting' });

    const result = await documents.listReviewDue(new Date(), 25);
    expect(result.map((d) => d.id)).toEqual([pending.id]);
    // A later due date than the reminder re-arms it.
    await documents.update(workspace.id, reminded.id, { review_due_at: new Date() });
    expect((await documents.listReviewDue(new Date(), 25)).map((d) => d.id).sort()).toEqual([pending.id, reminded.id].sort());
  });
});

describe('library ingest events (Prisma)', () => {
  it('appends once per event_id without aborting the transaction, and is read only per workspace', async () => {
    const a = await seedWorkspace('lib-ev-a');
    const b = await seedWorkspace('lib-ev-b');
    const doc = await seedDocument(a.workspace.id, a.user.id);
    const event = {
      document_id: doc.id,
      workspace_id: a.workspace.id,
      event_id: '40000000-0000-4000-8000-000000000001',
      job_id: null,
      sequence: 1,
      stage: 'parsing',
      outcome: 'progress',
      status: 'processing' as const,
      detail: { progress: { current: 1, total: 4 } },
      applied: true,
    };
    await transactions.run(async () => {
      expect(await events.append(event)).toEqual({ inserted: true });
      // A retried callback inside the same transaction: skipped, transaction still usable.
      expect(await events.append(event)).toEqual({ inserted: false });
      expect(await events.append({ ...event, event_id: null, stage: 'ingest_requested' })).toEqual({ inserted: true });
    });
    expect(await events.list(a.workspace.id, doc.id, 10)).toHaveLength(2);
    expect(await events.list(b.workspace.id, doc.id, 10)).toEqual([]);
  });

  it('exposes no update or delete', () => {
    expect(Object.getOwnPropertyNames(PrismaLibraryIngestEventRepository.prototype).sort()).toEqual(['append', 'constructor', 'list']);
  });
});

describe('library folders (Prisma)', () => {
  it('keeps names unique per parent including the root, and the same name under another parent is fine', async () => {
    const { user, workspace } = await seedWorkspace('lib-folders');
    const root = await folders.create({ workspace_id: workspace.id, parent_id: null, name: 'SOP', created_by: user.id, scopes: [{ scope_type: 'workspace', scope_ref: workspace.id }] });
    // Two root folders with the same name would pass a unique index over a nullable parent_id.
    await expect(folders.create({ workspace_id: workspace.id, parent_id: null, name: 'SOP', created_by: user.id, scopes: [{ scope_type: 'workspace', scope_ref: workspace.id }] })).rejects.toBeInstanceOf(ConflictError);
    const child = await folders.create({ workspace_id: workspace.id, parent_id: root.id, name: 'SOP', created_by: user.id, scopes: [{ scope_type: 'workspace', scope_ref: workspace.id }] });
    expect(child.parent_id).toBe(root.id);
    await expect(folders.create({ workspace_id: workspace.id, parent_id: root.id, name: 'SOP', created_by: user.id, scopes: [{ scope_type: 'workspace', scope_ref: workspace.id }] })).rejects.toBeInstanceOf(ConflictError);
  });

  it('allows the same root name in two workspaces', async () => {
    const a = await seedWorkspace('lib-fo-a');
    const b = await seedWorkspace('lib-fo-b');
    await folders.create({ workspace_id: a.workspace.id, parent_id: null, name: 'SOP', created_by: a.user.id, scopes: [{ scope_type: 'workspace', scope_ref: a.workspace.id }] });
    await expect(folders.create({ workspace_id: b.workspace.id, parent_id: null, name: 'SOP', created_by: b.user.id, scopes: [{ scope_type: 'workspace', scope_ref: b.workspace.id }] })).resolves.toBeDefined();
  });

  it('moves between root and a parent and keeps uniqueness on the move', async () => {
    const { user, workspace } = await seedWorkspace('lib-fo-move');
    const a = await folders.create({ workspace_id: workspace.id, parent_id: null, name: 'A', created_by: user.id, scopes: [{ scope_type: 'workspace', scope_ref: workspace.id }] });
    const b = await folders.create({ workspace_id: workspace.id, parent_id: null, name: 'B', created_by: user.id, scopes: [{ scope_type: 'workspace', scope_ref: workspace.id }] });
    const nestedB = await folders.create({ workspace_id: workspace.id, parent_id: a.id, name: 'B', created_by: user.id, scopes: [{ scope_type: 'workspace', scope_ref: workspace.id }] });
    await expect(folders.update(workspace.id, nestedB.id, { parent_id: null })).rejects.toBeInstanceOf(ConflictError);
    await expect(folders.update(workspace.id, b.id, { parent_id: a.id })).rejects.toBeInstanceOf(ConflictError);
    const renamed = await folders.update(workspace.id, nestedB.id, { name: 'C' });
    expect(renamed.name).toBe('C');
    expect((await folders.update(workspace.id, nestedB.id, { parent_id: null })).parent_id).toBeNull();
  });

  it('refuses to delete a folder with folders or documents inside at the database level too (NO ACTION)', async () => {
    const { user, workspace } = await seedWorkspace('lib-fo-del');
    const parent = await folders.create({ workspace_id: workspace.id, parent_id: null, name: 'Parent', created_by: user.id, scopes: [{ scope_type: 'workspace', scope_ref: workspace.id }] });
    const child = await folders.create({ workspace_id: workspace.id, parent_id: parent.id, name: 'Child', created_by: user.id, scopes: [{ scope_type: 'workspace', scope_ref: workspace.id }] });
    expect(await folders.contentCounts(workspace.id, parent.id)).toEqual({ folders: 1, documents: 0 });
    await expect(folders.delete(workspace.id, parent.id)).rejects.toThrow();

    const doc = await seedDocument(workspace.id, user.id, { folder_id: child.id, uploaded: false });
    expect(await folders.contentCounts(workspace.id, child.id)).toEqual({ folders: 0, documents: 1 });
    await expect(folders.delete(workspace.id, child.id)).rejects.toThrow();

    await documents.update(workspace.id, doc.id, { folder_id: null });
    await folders.delete(workspace.id, child.id);
    await folders.delete(workspace.id, parent.id);
    expect(await folders.listAll(workspace.id)).toEqual([]);
  });

  it('never reads or changes a folder of another workspace', async () => {
    const a = await seedWorkspace('lib-fo-iso-a');
    const b = await seedWorkspace('lib-fo-iso-b');
    const folder = await folders.create({ workspace_id: a.workspace.id, parent_id: null, name: 'Mine', created_by: a.user.id, scopes: [{ scope_type: 'workspace', scope_ref: a.workspace.id }] });
    expect(await folders.findById(b.workspace.id, folder.id)).toBeNull();
    expect(await folders.listAll(b.workspace.id)).toEqual([]);
    await expect(folders.update(b.workspace.id, folder.id, { name: 'stolen' })).rejects.toThrow();
    await folders.delete(b.workspace.id, folder.id);
    expect((await folders.findById(a.workspace.id, folder.id))?.name).toBe('Mine');
  });
});

describe('library use cases on Prisma: atomicity and deletion cascade', () => {
  function realDeps(overrides: Partial<LibraryDeps> = {}) {
    const store = new FakeObjectStore();
    const gateway = new FakeKnowledgeGateway();
    const audit = new RepositoryAuditLogger(new PrismaAuditRepository(prisma));
    let jobs = 0;
    const deps: LibraryDeps = {
      documents,
      folders,
      events,
      gateway,
      contextSigner: new FakeContextSigner(),
      store,
      audit,
      entitlements: allowAllEntitlements,
      transactions,
      log: new FakeLibraryLog(),
      newJobId: () => `00000000-0000-4000-8000-${String(++jobs).padStart(12, '0')}`,
      now: () => new Date(),
      ...overrides,
    };
    return { deps, store, gateway };
  }

  function context(workspaceId: string, userId: string): RequestContext {
    return {
      user_id: userId,
      workspace_id: workspaceId,
      session_id: 's',
      request_id: 'req-int-1',
      role: 'admin',
      specialist_scope: 'all',
      actor: { type: 'user', id: userId },
    };
  }

  async function uploaded(deps: LibraryDeps, store: FakeObjectStore, ctx: RequestContext) {
    const ticket = await new RequestLibraryUploadUseCase(deps).execute(
      {
        file_name: 'harga.pdf',
        content_type: 'application/pdf',
        byte_size: PDF_BYTES.length,
        sha256: sha256Hex(PDF_BYTES),
      },
      ctx,
    );
    const row = await documents.findById(ctx.workspace_id!, ticket.document_id);
    store.upload(row!.storage_key!, PDF_BYTES);
    return new CompleteLibraryUploadUseCase(deps).execute(ticket.document_id, ctx);
  }

  it('upload, ready event and delete leave no row of the document behind, and audit each step', async () => {
    const { user, workspace } = await seedWorkspace('lib-flow');
    const ctx = context(workspace.id, user.id);
    const { deps, store, gateway } = realDeps();
    const doc = await uploaded(deps, store, ctx);
    expect(doc).toMatchObject({ status: 'queued' });

    await new ApplyIngestEventUseCase(deps).execute(
      {
        event_id: '40000000-0000-4000-8000-0000000000f1',
        tenant_id: workspace.id,
        document_id: doc.id,
        job_id: doc.ingest_job_id!,
        sequence: 1,
        stage: 'completed',
        status: 'ready',
        occurred_at: new Date().toISOString(),
        progress: null,
        reason_code: null,
        pages: [],
        page_count: 2,
        chunk_count: 3,
        language: 'id',
        embedding_model: 'bge-m3',
        ocr_pages: 0,
        personal_data_hint: false,
      },
      'req-int-2',
    );
    expect((await documents.findById(workspace.id, doc.id))?.status).toBe('ready');

    await new DeleteLibraryDocumentUseCase(deps).execute(doc.id, ctx);
    expect(gateway.callsTo('deleteDocument')).toHaveLength(1);
    expect(await documents.findById(workspace.id, doc.id)).toBeNull();
    expect(await prisma.libraryDocumentScope.count({ where: { document_id: doc.id } })).toBe(0);
    expect(await prisma.libraryIngestEvent.count({ where: { document_id: doc.id } })).toBe(0);

    const actions = (await prisma.auditEvent.findMany({ where: { workspace_id: workspace.id }, orderBy: { occurred_at: 'asc' } })).map((row) => row.action);
    expect(actions).toEqual(['library.document.uploaded', 'library.document.indexed', 'library.document.deleted']);
  });

  it('a failed audit write rolls back the ingest status it describes', async () => {
    const { user, workspace } = await seedWorkspace('lib-atomic');
    const ctx = context(workspace.id, user.id);
    const { deps, store } = realDeps();
    const doc = await uploaded(deps, store, ctx);

    const failingAudit: AuditLogger = {
      log: async () => {
        throw new Error('audit down');
      },
    };
    await expect(
      new ApplyIngestEventUseCase({ ...deps, audit: failingAudit }).execute(
        {
          event_id: '40000000-0000-4000-8000-0000000000f2',
          tenant_id: workspace.id,
          document_id: doc.id,
          job_id: doc.ingest_job_id!,
          sequence: 1,
          stage: 'completed',
          status: 'ready',
          occurred_at: new Date().toISOString(),
          progress: null,
          reason_code: null,
          pages: [],
          page_count: 1,
          chunk_count: 1,
          language: null,
          embedding_model: null,
          ocr_pages: null,
          personal_data_hint: false,
        },
        'req-int-3',
      ),
    ).rejects.toThrow('audit down');

    const stored = await documents.findById(workspace.id, doc.id);
    expect(stored?.status).toBe('queued');
    expect(stored?.last_ingest_sequence).toBe(0);
    expect((await events.list(workspace.id, doc.id, 20)).filter((e) => e.event_id !== null)).toEqual([]);
  });

  it('a stray vector keeps the document in deleting and the rows in place', async () => {
    const { user, workspace } = await seedWorkspace('lib-stray');
    const ctx = context(workspace.id, user.id);
    const { deps, store, gateway } = realDeps();
    const doc = await uploaded(deps, store, ctx);
    gateway.deleteReport = { vectors_remaining: 1, verified: false };

    await expect(new DeleteLibraryDocumentUseCase(deps).execute(doc.id, ctx)).rejects.toMatchObject({ code: 'delete_unverified' });
    expect((await documents.findById(workspace.id, doc.id))?.status).toBe('deleting');
    expect(await prisma.libraryDocumentScope.count({ where: { document_id: doc.id } })).toBe(1);
    expect(store.deleted).toEqual([]);

    gateway.deleteReport = {};
    await new DeleteLibraryDocumentUseCase(deps).execute(doc.id, ctx);
    expect(await documents.findById(workspace.id, doc.id)).toBeNull();
  });

  it('deleting a workspace removes its library rows through the cascade', async () => {
    const { user, workspace } = await seedWorkspace('lib-ws-gone');
    const folder = await folders.create({ workspace_id: workspace.id, parent_id: null, name: 'F', created_by: user.id, scopes: [{ scope_type: 'workspace', scope_ref: workspace.id }] });
    const doc = await seedDocument(workspace.id, user.id, { folder_id: folder.id });
    await events.append({ document_id: doc.id, workspace_id: workspace.id, event_id: null, job_id: null, sequence: null, stage: 'x', outcome: 'y', status: null, detail: null, applied: true });
    // Folder FKs are NO ACTION (checked at statement end), so the workspace cascade removes folders and documents together.
    await prisma.workspace.delete({ where: { id: workspace.id } });
    expect(await prisma.libraryFolder.count({ where: { workspace_id: workspace.id } })).toBe(0);
    expect(await prisma.libraryDocumentScope.count({ where: { workspace_id: workspace.id } })).toBe(0);
    expect(await prisma.libraryIngestEvent.count({ where: { workspace_id: workspace.id } })).toBe(0);
  });
});

describe('collection access, counts and list filters (Prisma, ADR-0033)', () => {
  const everyone = (workspaceId: string) => ({ scope_type: 'workspace' as const, scope_ref: workspaceId });
  const only = (slug: string) => ({ scope_type: 'specialist' as const, scope_ref: slug });

  it('stores and replaces a collection access, in the workspace only', async () => {
    const a = await seedWorkspace('lib-fs-a');
    const b = await seedWorkspace('lib-fs-b');
    const folder = await folders.create({ workspace_id: a.workspace.id, parent_id: null, name: 'Pricing', created_by: a.user.id, scopes: [only('sinosales')] });
    expect((await folders.findById(a.workspace.id, folder.id))?.scopes).toEqual([only('sinosales')]);

    await folders.replaceScopes(a.workspace.id, folder.id, [everyone(a.workspace.id), only('sinohelp')]);
    // Scopes come back sorted by type then reference.
    expect((await folders.listAll(a.workspace.id))[0]?.scopes).toEqual([only('sinohelp'), everyone(a.workspace.id)]);
    // Another workspace cannot change it.
    await expect(folders.replaceScopes(b.workspace.id, folder.id, [everyone(b.workspace.id)])).rejects.toThrow();
    expect((await folders.findById(a.workspace.id, folder.id))?.scopes).toHaveLength(2);
  });

  it('deleting a collection removes its access rows', async () => {
    const { user, workspace } = await seedWorkspace('lib-fs-del');
    const folder = await folders.create({ workspace_id: workspace.id, parent_id: null, name: 'Gone', created_by: user.id, scopes: [everyone(workspace.id)] });
    await folders.delete(workspace.id, folder.id);
    expect(await prisma.libraryFolderScope.count({ where: { folder_id: folder.id } })).toBe(0);
  });

  it('lists the documents that follow a collection, pending uploads included', async () => {
    const { user, workspace } = await seedWorkspace('lib-inherit');
    const folder = await folders.create({ workspace_id: workspace.id, parent_id: null, name: 'F', created_by: user.id, scopes: [everyone(workspace.id)] });
    const follower = await seedDocument(workspace.id, user.id, { folder_id: folder.id, hash: '1'.repeat(64) });
    await documents.update(workspace.id, follower.id, { access_inherited: true });
    const pending = await seedDocument(workspace.id, user.id, { folder_id: folder.id, hash: '2'.repeat(64), uploaded: false });
    await documents.update(workspace.id, pending.id, { access_inherited: true });
    await seedDocument(workspace.id, user.id, { folder_id: folder.id, hash: '3'.repeat(64) });

    const inheriting = await documents.listInheriting(workspace.id, folder.id);
    expect(inheriting.map((d) => d.id).sort()).toEqual([follower.id, pending.id].sort());
    expect(inheriting.every((d) => d.access_inherited)).toBe(true);
  });

  it('summarises statuses and collections for what the caller may see, and not other workspaces', async () => {
    const a = await seedWorkspace('lib-sum-a');
    const b = await seedWorkspace('lib-sum-b');
    const folder = await folders.create({ workspace_id: a.workspace.id, parent_id: null, name: 'F', created_by: a.user.id, scopes: [everyone(a.workspace.id)] });
    const mk = async (hash: string, status: string, extra: Parameters<typeof seedDocument>[2] = {}) => {
      const doc = await seedDocument(a.workspace.id, a.user.id, { hash: hash.repeat(64), ...extra });
      await documents.update(a.workspace.id, doc.id, { status: status as 'ready' });
      return doc;
    };
    await mk('1', 'ready', { folder_id: folder.id });
    await mk('2', 'ready');
    await mk('3', 'queued');
    await mk('4', 'processing');
    await mk('5', 'needs_attention');
    await mk('6', 'failed');
    await mk('7', 'deleting');
    await mk('8', 'ready', { scopes: [only('sinofinance')] });
    await mk('9', 'ready', { uploaded: false });
    await seedDocument(b.workspace.id, b.user.id, { hash: 'a'.repeat(64) });

    expect(await documents.summary(a.workspace.id, { all: true })).toEqual({
      total: 7,
      by_status: { ready: 3, reading: 2, needs_attention: 1, failed: 1 },
      by_folder: { [folder.id]: 1 },
      in_root: 6,
    });
    const restricted = await documents.summary(a.workspace.id, { all: false, specialists: ['sinohelp'] });
    expect(restricted.total).toBe(6);
    expect(restricted.by_status.ready).toBe(2);
  });

  it('counts what each companion knows: ready documents, Everyone once, specialist-only by slug', async () => {
    const { user, workspace } = await seedWorkspace('lib-know');
    const mk = async (hash: string, scopes: Array<ReturnType<typeof only> | ReturnType<typeof everyone>>, status = 'ready') => {
      const doc = await seedDocument(workspace.id, user.id, { hash: hash.repeat(64), scopes });
      await documents.update(workspace.id, doc.id, { status: status as 'ready' });
    };
    await mk('1', [everyone(workspace.id)]);
    await mk('2', [everyone(workspace.id), only('sinosales')]);
    await mk('3', [only('sinosales')]);
    await mk('4', [only('sinosales'), only('sinohelp')]);
    await mk('5', [only('sinosales')], 'processing');
    await mk('6', [only('sinosales')], 'deleting');

    expect(await documents.knowledgeCounts(workspace.id)).toEqual({
      everyone: 2,
      specialist_only: { sinosales: 2, sinohelp: 1 },
    });
  });

  it('filters by used_by and reading, and sorts by name and size', async () => {
    const { user, workspace } = await seedWorkspace('lib-list');
    const mk = async (hash: string, title: string, scopes: Array<ReturnType<typeof only> | ReturnType<typeof everyone>>, status: string, size: number) => {
      const doc = await seedDocument(workspace.id, user.id, { hash: hash.repeat(64), scopes });
      await documents.update(workspace.id, doc.id, { title, status: status as 'ready', byte_size: size });
    };
    await mk('1', 'Everyone doc', [everyone(workspace.id)], 'ready', 5);
    await mk('2', 'Sales only', [only('sinosales')], 'ready', 500);
    await mk('3', 'Help only', [only('sinohelp')], 'ready', 50);
    await mk('4', 'Being read', [everyone(workspace.id)], 'processing', 1);
    await mk('5', 'Waiting', [everyone(workspace.id)], 'queued', 2);
    const base = { workspace_id: workspace.id, access: { all: true } as const, limit: 25 };

    const sales = await documents.list({ ...base, used_by: 'sinosales' });
    expect(sales.items.map((d) => d.title).sort()).toEqual(['Being read', 'Everyone doc', 'Sales only', 'Waiting']);
    const reading = await documents.list({ ...base, status: 'reading' });
    expect(reading.items.map((d) => d.title).sort()).toEqual(['Being read', 'Waiting']);
    expect((await documents.list({ ...base, sort: 'name' })).items.map((d) => d.title)).toEqual([
      'Being read',
      'Everyone doc',
      'Help only',
      'Sales only',
      'Waiting',
    ]);
    const bySize = await documents.list({ ...base, sort: 'size', limit: 2 });
    expect(bySize.items.map((d) => d.title)).toEqual(['Sales only', 'Help only']);
    // The cursor keeps the chosen order on the next page.
    const next = await documents.list({ ...base, sort: 'size', limit: 2, cursor: bySize.next_cursor! });
    expect(next.items.map((d) => d.title)).toEqual(['Everyone doc', 'Waiting']);
  });
});
