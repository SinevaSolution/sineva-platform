import { describe, expect, it } from 'vitest';
import {
  CreateLibraryFolderSchema,
  ListLibraryDocumentsQuerySchema,
  RequestLibraryUploadSchema,
  UpdateLibraryDocumentSchema,
  UpdateLibraryFolderSchema,
} from '@/server/application/dtos/library_dto';
import { GetLibraryKnowledgeUseCase } from '@/server/application/use-cases/library/get_library_knowledge_use_case';
import { GetLibrarySummaryUseCase } from '@/server/application/use-cases/library/get_library_summary_use_case';
import { GetLibraryUsageUseCase } from '@/server/application/use-cases/library/get_library_usage_use_case';
import { CreateLibraryFolderUseCase } from '@/server/application/use-cases/library/create_library_folder_use_case';
import { CreateLibraryDocumentUseCase } from '@/server/application/use-cases/library/create_library_document_use_case';
import { ListLibraryDocumentsUseCase } from '@/server/application/use-cases/library/list_library_documents_use_case';
import { ListLibraryFoldersUseCase } from '@/server/application/use-cases/library/list_library_folders_use_case';
import { UpdateLibraryDocumentUseCase } from '@/server/application/use-cases/library/update_library_document_use_case';
import { UpdateLibraryFolderUseCase } from '@/server/application/use-cases/library/update_library_folder_use_case';
import { LIBRARY_SCOPE_TYPES } from '@/server/domain/library/library';
import {
  computeRetrievalScope,
  principalsForScopes,
  type ScopeRef,
} from '@/server/domain/library/library_access';
import { ForbiddenError, NotFoundError } from '@/server/domain/errors/domain_error';
import { InMemoryConversations } from './fakes/in_memory_chat_store';
import { OTHER_USER, WS, buildHarness, ctx, uploadAndComplete } from './library_harness';

const everyone: ScopeRef = { scope_type: 'workspace', scope_ref: WS };
const only = (slug: string): ScopeRef => ({ scope_type: 'specialist', scope_ref: slug });
const memberOf = (specialists: string[]) =>
  ctx({ role: 'member', user_id: OTHER_USER, specialist_scope: 'selected', allowed_specialists: specialists });

const SQUAD_ID = '77777777-7777-4777-8777-777777777777';

describe('squad and workflow scope types (ADR-0033, ADR-0043)', () => {
  it('knows workflow next to squad; the API now accepts a squad scope and still rejects workflow', () => {
    expect(LIBRARY_SCOPE_TYPES).toEqual(['workspace', 'specialist', 'squad', 'workflow']);
    const squad = [{ scope_type: 'squad', scope_ref: SQUAD_ID }];
    const workflow = [{ scope_type: 'workflow', scope_ref: SQUAD_ID }];
    expect(CreateLibraryFolderSchema.safeParse({ name: 'x', scopes: squad }).success).toBe(true);
    expect(UpdateLibraryFolderSchema.safeParse({ scopes: squad }).success).toBe(true);
    expect(UpdateLibraryDocumentSchema.safeParse({ scopes: squad }).success).toBe(true);
    // A squad is addressed by id, never by a free word.
    expect(CreateLibraryFolderSchema.safeParse({ name: 'x', scopes: [{ scope_type: 'squad', scope_ref: 'launch' }] }).success).toBe(false);
    expect(CreateLibraryFolderSchema.safeParse({ name: 'x', scopes: workflow }).success).toBe(false);
    expect(UpdateLibraryDocumentSchema.safeParse({ scopes: workflow }).success).toBe(false);
    const upload = { file_name: 'a.pdf', content_type: 'application/pdf', byte_size: 10, sha256: 'a'.repeat(64) };
    expect(RequestLibraryUploadSchema.safeParse({ ...upload, scopes: squad }).success).toBe(true);
    expect(RequestLibraryUploadSchema.safeParse({ ...upload, scopes: workflow }).success).toBe(false);
  });

  it('puts a document in a squad scope when the squad is an active squad of the workspace', async () => {
    const h = buildHarness();
    h.deps.squads = { existingActiveIds: async (_ws: string, ids: string[]) => ids.filter((id) => id === SQUAD_ID) };
    const folder = await new CreateLibraryFolderUseCase(h.deps).execute(
      { name: 'Back-office files', scopes: [{ scope_type: 'squad', scope_ref: SQUAD_ID }] },
      ctx(),
    );
    expect(folder.scopes).toEqual([{ scope_type: 'squad', scope_ref: SQUAD_ID }]);
    expect(principalsForScopes(folder.scopes)).toEqual([`squad:${SQUAD_ID}`]);
  });

  it('rejects a squad that is unknown, archived or from another workspace with the same 422', async () => {
    const h = buildHarness();
    h.deps.squads = { existingActiveIds: async () => [] };
    await expect(
      new CreateLibraryFolderUseCase(h.deps).execute({ name: 'x', scopes: [{ scope_type: 'squad', scope_ref: SQUAD_ID }] }, ctx()),
    ).rejects.toMatchObject({ details: [expect.objectContaining({ code: 'unknown_squad' })] });
  });

  it('rejects a squad scope when squads are not wired at all, instead of storing a dangling principal', async () => {
    const h = buildHarness();
    await expect(
      new CreateLibraryFolderUseCase(h.deps).execute({ name: 'x', scopes: [{ scope_type: 'squad', scope_ref: SQUAD_ID }] }, ctx()),
    ).rejects.toMatchObject({ details: [expect.objectContaining({ code: 'unknown_squad' })] });
  });

  it('keeps squad scopes away from a member limited to some specialists, as target and as reader', async () => {
    const h = buildHarness();
    h.deps.squads = { existingActiveIds: async (_ws: string, ids: string[]) => ids };
    await expect(
      new CreateLibraryFolderUseCase(h.deps).execute(
        { name: 'x', scopes: [{ scope_type: 'squad', scope_ref: SQUAD_ID }] },
        memberOf(['sinofinance']),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('writes the principals for them, and never sends them in a Library retrieval test scope (squad chat gets them from the signed context)', () => {
    expect(
      principalsForScopes([
        { scope_type: 'squad', scope_ref: 's1' },
        { scope_type: 'workflow', scope_ref: 'w1' },
      ]),
    ).toEqual(['squad:s1', 'workflow:w1']);
    for (const slug of [null, 'sino', 'sinosales', 'sinohelp']) {
      const principals = computeRetrievalScope(ctx(), { agent_slug: slug }).principals;
      expect(principals.some((p) => p.startsWith('squad:') || p.startsWith('workflow:'))).toBe(false);
    }
  });

  it('allows inherit_access only without scopes', () => {
    expect(UpdateLibraryDocumentSchema.safeParse({ inherit_access: true }).success).toBe(true);
    expect(UpdateLibraryDocumentSchema.safeParse({ inherit_access: true, scopes: [{ scope_type: 'workspace' }] }).success).toBe(false);
  });
});

describe('retrieval scope matches what each companion may use (ADR-0033)', () => {
  it('Sino in a team chat reads Everyone only; a specialist reads Everyone plus its own', () => {
    expect(computeRetrievalScope(ctx(), {}).principals).toEqual(['workspace']);
    expect(computeRetrievalScope(ctx(), { agent_slug: 'sinosales' }).principals).toEqual(['workspace', 'agent:sinosales']);
    expect(computeRetrievalScope(ctx(), { agent_slug: 'sinohelp' }).principals).toEqual(['workspace', 'agent:sinohelp']);
  });

  it('a document limited to SinoSales carries only that label, so no other companion reads it', async () => {
    const h = buildHarness();
    const doc = await uploadAndComplete(h, { dto: { scopes: [{ scope_type: 'specialist', scope_ref: 'sinosales' }] } });
    const labels = principalsForScopes(doc.scopes);
    expect(labels).toEqual(['agent:sinosales']);
    const readable = (slug: string | null) =>
      labels.some((label) => computeRetrievalScope(ctx(), { agent_slug: slug }).principals.includes(label));
    expect(readable('sinosales')).toBe(true);
    expect(readable('sinohelp')).toBe(false);
    expect(readable(null)).toBe(false);
  });
});

describe('collections carry who can use them', () => {
  it('a new collection is Everyone at the top level and takes its parent access below', async () => {
    const h = buildHarness();
    const create = new CreateLibraryFolderUseCase(h.deps);
    const top = await create.execute({ name: 'Sales' }, ctx());
    expect(top.scopes).toEqual([everyone]);
    const limited = await create.execute({ name: 'Pricing', scopes: [{ scope_type: 'specialist', scope_ref: 'sinosales' }] }, ctx());
    expect(limited.scopes).toEqual([only('sinosales')]);
    const child = await create.execute({ name: '2026', parent_id: limited.id }, ctx());
    expect(child.scopes).toEqual([only('sinosales')]);
    const override = await create.execute({ name: 'Open', parent_id: limited.id, scopes: [{ scope_type: 'workspace' }] }, ctx());
    expect(override.scopes).toEqual([everyone]);
  });

  it('refuses an unknown specialist and one the member may not use', async () => {
    const h = buildHarness();
    const create = new CreateLibraryFolderUseCase(h.deps);
    await expect(
      create.execute({ name: 'x', scopes: [{ scope_type: 'specialist', scope_ref: 'sino-evil' }] }, ctx()),
    ).rejects.toThrow();
    await expect(
      create.execute({ name: 'y', scopes: [{ scope_type: 'specialist', scope_ref: 'sinofinance' }] }, memberOf(['sinohelp'])),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lists a restricted member only the collections Everyone or their specialists can use', async () => {
    const h = buildHarness();
    const create = new CreateLibraryFolderUseCase(h.deps);
    await create.execute({ name: 'Shared' }, ctx());
    await create.execute({ name: 'Help only', scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }] }, ctx());
    await create.execute({ name: 'Finance only', scopes: [{ scope_type: 'specialist', scope_ref: 'sinofinance' }] }, ctx());
    const seen = await new ListLibraryFoldersUseCase(h.deps).execute(memberOf(['sinohelp']));
    expect(seen.items.map((f) => f.name).sort()).toEqual(['Help only', 'Shared']);
    const all = await new ListLibraryFoldersUseCase(h.deps).execute(ctx());
    expect(all.items).toHaveLength(3);
  });

  it('hides a collection from a member who cannot use it: uploading into it is a 404', async () => {
    const h = buildHarness();
    const hidden = await new CreateLibraryFolderUseCase(h.deps).execute(
      { name: 'Finance only', scopes: [{ scope_type: 'specialist', scope_ref: 'sinofinance' }] },
      ctx(),
    );
    await expect(
      uploadAndComplete(h, { context: memberOf(['sinohelp']), dto: { folder_id: hidden.id } }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('documents inherit the collection access and may override it', () => {
  async function limitedFolder(h: ReturnType<typeof buildHarness>, slug = 'sinosales') {
    return new CreateLibraryFolderUseCase(h.deps).execute(
      { name: 'Pricing', scopes: [{ scope_type: 'specialist', scope_ref: slug }] },
      ctx(),
    );
  }

  it('an upload without scopes takes its collection access; at the top level it is Everyone', async () => {
    const h = buildHarness();
    const folder = await limitedFolder(h);
    const inside = await uploadAndComplete(h, { dto: { folder_id: folder.id } });
    expect(inside.scopes).toEqual([only('sinosales')]);
    expect(inside.access_inherited).toBe(true);
    const bytes = new TextEncoder().encode('%PDF-1.7 other body');
    const top = await uploadAndComplete(h, { bytes });
    expect(top.scopes).toEqual([everyone]);
    expect(top.access_inherited).toBe(true);
  });

  it('an upload with scopes is an override, whatever the collection says', async () => {
    const h = buildHarness();
    const folder = await limitedFolder(h);
    const doc = await uploadAndComplete(h, { dto: { folder_id: folder.id, scopes: [{ scope_type: 'workspace' }] } });
    expect(doc.scopes).toEqual([everyone]);
    expect(doc.access_inherited).toBe(false);
  });

  it('a note inherits too', async () => {
    const h = buildHarness();
    const folder = await limitedFolder(h);
    const note = await new CreateLibraryDocumentUseCase({ ...h.deps, conversations: new InMemoryConversations() }).execute(
      { source_type: 'note', title: 'Harga', content: 'Kopi 25.000', folder_id: folder.id },
      ctx(),
    );
    expect(note.scopes).toEqual([only('sinosales')]);
    expect(note.access_inherited).toBe(true);
  });

  it('changing a collection access relabels its inheriting documents only, without a re-read', async () => {
    const h = buildHarness();
    const folder = await limitedFolder(h);
    const follower = await uploadAndComplete(h, { dto: { folder_id: folder.id } });
    const overrideBytes = new TextEncoder().encode('%PDF-1.7 override body');
    const override = await uploadAndComplete(h, {
      bytes: overrideBytes,
      dto: { folder_id: folder.id, scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }] },
    });
    h.gateway.calls.length = 0;

    const updated = await new UpdateLibraryFolderUseCase(h.deps).execute(
      folder.id,
      { scopes: [{ scope_type: 'workspace' }] },
      ctx(),
    );

    expect(updated.scopes).toEqual([everyone]);
    expect((await h.documents.findById(WS, follower.id))!.scopes).toEqual([everyone]);
    expect((await h.documents.findById(WS, override.id))!.scopes).toEqual([only('sinohelp')]);
    const acl = h.gateway.callsTo('updateAcl');
    expect(acl).toHaveLength(1);
    expect((acl[0]![0] as { document_id: string; acl: string[] }).document_id).toBe(follower.id);
    expect((acl[0]![0] as { acl: string[] }).acl).toEqual(['workspace']);
    expect(h.gateway.callsTo('requestReindex')).toEqual([]);
    expect((await h.documents.findById(WS, follower.id))!.acl_synced_at).not.toBeNull();
  });

  it('keeps the new collection access and flags the document when the relabel fails', async () => {
    const h = buildHarness();
    const folder = await limitedFolder(h);
    const follower = await uploadAndComplete(h, { dto: { folder_id: folder.id } });
    h.gateway.aclFails = true;
    const updated = await new UpdateLibraryFolderUseCase(h.deps).execute(folder.id, { scopes: [{ scope_type: 'workspace' }] }, ctx());
    expect(updated.scopes).toEqual([everyone]);
    const row = await h.documents.findById(WS, follower.id);
    expect(row!.scopes).toEqual([everyone]);
    expect(row!.acl_synced_at).toBeNull();
    expect(h.log.entries.some((entry) => entry.event === 'library.acl_sync_failed')).toBe(true);
  });

  it('moving an inheriting document adopts the target access; an override keeps its own', async () => {
    const h = buildHarness();
    const folder = await limitedFolder(h, 'sinosales');
    const follower = await uploadAndComplete(h);
    const overrideBytes = new TextEncoder().encode('%PDF-1.7 override body');
    const override = await uploadAndComplete(h, { bytes: overrideBytes, dto: { scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }] } });
    const update = new UpdateLibraryDocumentUseCase(h.deps);

    const moved = await update.execute(follower.id, { folder_id: folder.id }, ctx());
    expect(moved.scopes).toEqual([only('sinosales')]);
    expect(moved.access_inherited).toBe(true);
    const keptOverride = await update.execute(override.id, { folder_id: folder.id }, ctx());
    expect(keptOverride.scopes).toEqual([only('sinohelp')]);
    expect(keptOverride.access_inherited).toBe(false);
  });

  it('inherit_access puts an overridden document back on its collection; scopes mark it overridden', async () => {
    const h = buildHarness();
    const folder = await limitedFolder(h);
    const doc = await uploadAndComplete(h, { dto: { folder_id: folder.id, scopes: [{ scope_type: 'workspace' }] } });
    const update = new UpdateLibraryDocumentUseCase(h.deps);
    const back = await update.execute(doc.id, { inherit_access: true }, ctx());
    expect(back.scopes).toEqual([only('sinosales')]);
    expect(back.access_inherited).toBe(true);
    const overridden = await update.execute(doc.id, { scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }] }, ctx());
    expect(overridden.access_inherited).toBe(false);
  });
});

describe('listing: used_by, reading, sort', () => {
  async function seeded() {
    const h = buildHarness();
    const mk = (title: string, scopes: ScopeRef[], extra: Record<string, unknown> = {}) =>
      h.documents.seed({ workspace_id: WS, title, scopes, status: 'ready', ...extra });
    mk('Everyone doc', [everyone], { byte_size: 5 });
    mk('Sales only', [only('sinosales')], { byte_size: 500 });
    mk('Help only', [only('sinohelp')], { byte_size: 50 });
    mk('Being read', [everyone], { status: 'processing', byte_size: 1 });
    mk('Waiting', [everyone], { status: 'queued', byte_size: 2 });
    return h;
  }

  it('used_by lists what a specialist can really use: Everyone plus its own', async () => {
    const h = await seeded();
    const list = new ListLibraryDocumentsUseCase(h.deps);
    const sales = await list.execute({ limit: 25, used_by: 'sinosales' }, ctx());
    expect(sales.items.map((d) => d.title).sort()).toEqual(['Being read', 'Everyone doc', 'Sales only', 'Waiting']);
  });

  it('status reading groups queued and processing', async () => {
    const h = await seeded();
    const reading = await new ListLibraryDocumentsUseCase(h.deps).execute({ limit: 25, status: 'reading' }, ctx());
    expect(reading.items.map((d) => d.title).sort()).toEqual(['Being read', 'Waiting']);
  });

  it('sorts by name and by size', async () => {
    const h = await seeded();
    const list = new ListLibraryDocumentsUseCase(h.deps);
    const byName = await list.execute({ limit: 25, sort: 'name' }, ctx());
    expect(byName.items.map((d) => d.title)).toEqual(['Being read', 'Everyone doc', 'Help only', 'Sales only', 'Waiting']);
    const bySize = await list.execute({ limit: 25, sort: 'size' }, ctx());
    expect(bySize.items[0]!.title).toBe('Sales only');
  });

  it('validates the new query values', () => {
    expect(ListLibraryDocumentsQuerySchema.parse({ used_by: 'sinosales', sort: 'name', status: 'reading' })).toMatchObject({
      used_by: 'sinosales',
      sort: 'name',
      status: 'reading',
    });
    expect(ListLibraryDocumentsQuerySchema.safeParse({ sort: 'random' }).success).toBe(false);
    expect(ListLibraryDocumentsQuerySchema.safeParse({ used_by: 'not-a-specialist' }).success).toBe(false);
  });
});

describe('summary and what each companion knows', () => {
  it('counts statuses and collections for what the caller may see', async () => {
    const h = buildHarness();
    const folder = await new CreateLibraryFolderUseCase(h.deps).execute({ name: 'SOP' }, ctx());
    const mk = (status: 'ready' | 'queued' | 'processing' | 'needs_attention' | 'failed' | 'deleting', extra: Record<string, unknown> = {}) =>
      h.documents.seed({ workspace_id: WS, status, scopes: [everyone], ...extra });
    mk('ready', { folder_id: folder.id });
    mk('ready');
    mk('queued');
    mk('processing');
    mk('needs_attention');
    mk('failed');
    mk('deleting');
    h.documents.seed({ workspace_id: WS, status: 'ready', scopes: [only('sinofinance')] });

    const summary = await new GetLibrarySummaryUseCase(h.deps).execute(ctx());
    expect(summary).toEqual({
      total: 7,
      by_status: { ready: 3, reading: 2, needs_attention: 1, failed: 1 },
      by_folder: { [folder.id]: 1 },
      in_root: 6,
    });

    const restricted = await new GetLibrarySummaryUseCase(h.deps).execute(memberOf(['sinohelp']));
    expect(restricted.total).toBe(6);
    expect(restricted.by_status.ready).toBe(2);
  });

  it('Knows N counts ready documents: Everyone for Sino, Everyone plus its own for each specialist', async () => {
    const h = buildHarness();
    const mk = (scopes: ScopeRef[], status: 'ready' | 'processing' = 'ready') =>
      h.documents.seed({ workspace_id: WS, status, scopes });
    mk([everyone]);
    mk([everyone]);
    mk([everyone], 'processing');
    mk([only('sinosales')]);
    mk([only('sinosales'), only('sinohelp')]);
    mk([everyone, only('sinosales')]); // Everyone already covers it: counted once
    h.documents.seed({ workspace_id: WS, status: 'deleting', scopes: [only('sinosales')] });

    const knows = await new GetLibraryKnowledgeUseCase(h.deps).execute(ctx());
    expect(knows.everyone).toBe(3);
    expect(knows.specialists.sinosales).toBe(5);
    expect(knows.specialists.sinohelp).toBe(4);
    expect(knows.specialists.sinofinance).toBe(3);
    expect(knows.specialists).not.toHaveProperty('sino');
  });

  it('a restricted member sees counts only for the specialists they may use', async () => {
    const h = buildHarness();
    h.documents.seed({ workspace_id: WS, status: 'ready', scopes: [only('sinosales')] });
    const knows = await new GetLibraryKnowledgeUseCase(h.deps).execute(memberOf(['sinohelp']));
    expect(Object.keys(knows.specialists)).toEqual(['sinohelp']);
  });

  it('never counts another workspace', async () => {
    const h = buildHarness();
    h.documents.seed({ workspace_id: '22222222-2222-4222-8222-222222222222', status: 'ready', scopes: [{ scope_type: 'workspace', scope_ref: '22222222-2222-4222-8222-222222222222' }] });
    const knows = await new GetLibraryKnowledgeUseCase(h.deps).execute(ctx());
    expect(knows.everyone).toBe(0);
  });
});

describe('usage shows a storage limit only when one exists', () => {
  it('is null in open mode and a number of bytes when the entitlement has a ceiling', async () => {
    const h = buildHarness();
    h.documents.seed({ workspace_id: WS, byte_size: 2048, scopes: [everyone] });
    const open = await new GetLibraryUsageUseCase(h.deps).execute(ctx());
    expect(open.storage_limit_bytes).toBeNull();
    h.entitlements.limits.set('library.storage_mb', 10);
    const limited = await new GetLibraryUsageUseCase(h.deps).execute(ctx());
    expect(limited.storage_limit_bytes).toBe(10 * 1024 * 1024);
  });
});
