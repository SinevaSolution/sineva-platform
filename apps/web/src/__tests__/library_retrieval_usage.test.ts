import { describe, expect, it } from 'vitest';
import { GetLibraryUsageUseCase } from '@/server/application/use-cases/library/get_library_usage_use_case';
import { SendLibraryReviewRemindersUseCase } from '@/server/application/use-cases/library/send_library_review_reminders_use_case';
import { TryLibraryRetrievalUseCase } from '@/server/application/use-cases/library/try_library_retrieval_use_case';
import { ENTITLEMENT_KEYS } from '@/server/domain/entitlements/entitlements';
import { ForbiddenError, UpstreamUnavailableError, ValidationError } from '@/server/domain/errors/domain_error';
import type { SearchHit } from '@/server/domain/library/knowledge_ingest_gateway';
import { FakeReviewInbox } from './fakes/library_fakes';
import { NOW, OTHER_USER, OTHER_WS, USER, WS, buildHarness, ctx, uploadAndComplete } from './library_harness';

const hit = (documentId: string, over: Partial<SearchHit> = {}): SearchHit => ({
  document_id: documentId,
  chunk_id: `chunk-${documentId}`,
  page: 2,
  section_path: 'Harga > Kopi',
  snippet: 'Kopi susu 25.000',
  source_uri: null,
  trust_label: 'owner_upload',
  ...over,
});

async function readyDoc(h: ReturnType<typeof buildHarness>, dto: Record<string, unknown> = {}, text = 'a') {
  const doc = await uploadAndComplete(h, { bytes: new TextEncoder().encode(`%PDF-1.4 ${text}`), dto: { file_name: `${text}.pdf`, ...dto } });
  return h.documents.update(WS, doc.id, { status: 'ready', title: `Title ${text}` });
}

describe('"Try a question" retrieval: scope computed on the server (FR-LIB-05, FR-LIB-15)', () => {
  it('sends the principals from the session and the executing specialist, never anything from the client', async () => {
    const h = buildHarness();
    const doc = await readyDoc(h);
    h.gateway.searchResult = { results: [hit(doc.id)], abstained: false, abstain_reason: null };

    const result = await new TryLibraryRetrievalUseCase(h.deps).execute({ query: 'harga kopi', agent_slug: 'sinohelp', top_k: 5 }, ctx());

    expect(h.gateway.callsTo('search')[0]?.[0]).toEqual({
      tenant_id: WS,
      principals: ['workspace', 'agent:sinohelp'],
      query_text: 'harga kopi',
      top_k: 5,
    });
    expect(h.signer.minted.at(-1)?.options?.agent_slug).toBe('sinohelp');
    expect(result.principals).toEqual(['workspace', 'agent:sinohelp']);
    expect(result.results).toEqual([
      {
        document_id: doc.id,
        title: 'Title a',
        chunk_id: `chunk-${doc.id}`,
        page: 2,
        section_path: 'Harga > Kopi',
        snippet: 'Kopi susu 25.000',
        source_uri: null,
        trust_label: 'owner_upload',
      },
    ]);
    // Fused scores are not cosine-like, so none reach the user (PRD API note).
    expect(JSON.stringify(result)).not.toContain('score');
  });

  it('uses only the workspace principal when no specialist is chosen', async () => {
    const h = buildHarness();
    await new TryLibraryRetrievalUseCase(h.deps).execute({ query: 'x', top_k: 5 }, ctx());
    expect((h.gateway.callsTo('search')[0]?.[0] as { principals: string[] }).principals).toEqual(['workspace']);
  });

  it('refuses a specialist the member may not use, before asking sineva-ai anything', async () => {
    const h = buildHarness();
    const member = ctx({ role: 'member', specialist_scope: 'selected', allowed_specialists: ['sinopeople'] });
    await expect(
      new TryLibraryRetrievalUseCase(h.deps).execute({ query: 'x', agent_slug: 'sinofinance', top_k: 5 }, member),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(h.gateway.callsTo('search')).toEqual([]);
  });

  it('rejects an unknown specialist', async () => {
    const h = buildHarness();
    await expect(
      new TryLibraryRetrievalUseCase(h.deps).execute({ query: 'x', agent_slug: 'sino-evil', top_k: 5 }, ctx()),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('drops hits the platform cannot vouch for: foreign workspace, deleting, not ready, outside the scope', async () => {
    const h = buildHarness();
    const ok = await readyDoc(h, {}, 'ok');
    const scoped = await readyDoc(h, { scopes: [{ scope_type: 'specialist', scope_ref: 'sinofinance' }] }, 'scoped');
    const deleting = await readyDoc(h, {}, 'deleting');
    await h.documents.update(WS, deleting.id, { status: 'deleting' });
    const queued = await readyDoc(h, {}, 'queued');
    await h.documents.update(WS, queued.id, { status: 'queued' });
    const foreign = h.documents.seed({ workspace_id: OTHER_WS, status: 'ready' });
    h.gateway.searchResult = {
      results: [hit(ok.id), hit(scoped.id), hit(deleting.id), hit(queued.id), hit(foreign.id), hit('00000000-0000-4000-8000-0000000000ff')],
      abstained: false,
      abstain_reason: null,
    };

    const result = await new TryLibraryRetrievalUseCase(h.deps).execute({ query: 'x', agent_slug: 'sinohelp', top_k: 5 }, ctx());

    expect(result.results.map((r) => r.document_id)).toEqual([ok.id]);
    const rejected = h.log.entries.find((e) => e.event === 'library.retrieval_rejected');
    expect(rejected?.fields).toMatchObject({ workspace_id: WS, count: 5 });
  });

  it('keeps a hit for a document scoped to the chosen specialist', async () => {
    const h = buildHarness();
    const doc = await readyDoc(h, { scopes: [{ scope_type: 'specialist', scope_ref: 'sinohelp' }] });
    h.gateway.searchResult = { results: [hit(doc.id)], abstained: false, abstain_reason: null };
    const result = await new TryLibraryRetrievalUseCase(h.deps).execute({ query: 'x', agent_slug: 'sinohelp', top_k: 5 }, ctx());
    expect(result.results).toHaveLength(1);
  });

  it('reports abstention instead of inventing an answer, also when every hit was dropped', async () => {
    const h = buildHarness();
    h.gateway.searchResult = { results: [], abstained: true, abstain_reason: 'no_results_above_threshold' };
    expect(await new TryLibraryRetrievalUseCase(h.deps).execute({ query: 'x', top_k: 5 }, ctx())).toMatchObject({
      results: [],
      abstained: true,
      abstain_reason: 'no_results_above_threshold',
    });

    const foreign = h.documents.seed({ workspace_id: OTHER_WS, status: 'ready' });
    h.gateway.searchResult = { results: [hit(foreign.id)], abstained: false, abstain_reason: null };
    expect(await new TryLibraryRetrievalUseCase(h.deps).execute({ query: 'x', top_k: 5 }, ctx())).toMatchObject({
      results: [],
      abstained: true,
      abstain_reason: 'no_authorized_results',
    });
  });

  it('cuts a long snippet and surfaces an unreachable sineva-ai as a 503 without any canned result', async () => {
    const h = buildHarness();
    const doc = await readyDoc(h);
    h.gateway.searchResult = { results: [hit(doc.id, { snippet: 'x'.repeat(900) })], abstained: false, abstain_reason: null };
    const result = await new TryLibraryRetrievalUseCase(h.deps).execute({ query: 'x', top_k: 5 }, ctx());
    expect(result.results[0]?.snippet).toHaveLength(400);

    h.gateway.mode = 'unreachable';
    await expect(new TryLibraryRetrievalUseCase(h.deps).execute({ query: 'x', top_k: 5 }, ctx())).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });
});

describe('usage (FR-LIB-27: counts only in M1)', () => {
  it('counts documents, storage and OCR pages of this workspace only, and checks the three quotas', async () => {
    const h = buildHarness();
    const a = await readyDoc(h, {}, 'a');
    await h.documents.update(WS, a.id, { ocr_page_count: 7, last_indexed_at: new Date(NOW.getTime() - 60_000) });
    h.documents.seed({ workspace_id: OTHER_WS, byte_size: 5_000_000, ocr_page_count: 99 });
    h.entitlements.checks.length = 0;

    const usage = await new GetLibraryUsageUseCase(h.deps).execute(ctx());

    expect(usage).toMatchObject({ documents: 1, storage_bytes: a.byte_size, ocr_pages_month: 7 });
    expect(h.entitlements.checks).toEqual([
      { workspace_id: WS, key: ENTITLEMENT_KEYS.DOCUMENTS, quantity: 1 },
      { workspace_id: WS, key: ENTITLEMENT_KEYS.STORAGE_MB, quantity: 1 },
      { workspace_id: WS, key: ENTITLEMENT_KEYS.OCR_PAGES, quantity: 7 },
    ]);
    expect(usage.within_limits).toEqual({ documents: true, storage: true, ocr_pages: true });
  });

  it('reports a quota that is exceeded without deleting or changing anything', async () => {
    const h = buildHarness({ denied: [ENTITLEMENT_KEYS.STORAGE_MB] });
    h.documents.seed({ workspace_id: WS, status: 'ready' });
    const usage = await new GetLibraryUsageUseCase(h.deps).execute(ctx());
    expect(usage.within_limits).toEqual({ documents: true, storage: false, ocr_pages: true });
    expect(h.documents.rows.size).toBe(1);
  });
});

describe('review reminders (FR-LIB-22, WP task 6)', () => {
  const due = new Date(NOW.getTime() - 86_400_000);

  it('creates a "check if still current" item for each overdue document and marks it reminded', async () => {
    const h = buildHarness();
    const inbox = new FakeReviewInbox();
    const doc = h.documents.seed({ workspace_id: WS, created_by: USER, review_due_at: due.toISOString() });
    h.documents.seed({ workspace_id: WS, review_due_at: new Date(NOW.getTime() + 86_400_000).toISOString() });
    h.documents.seed({ workspace_id: WS, review_due_at: due.toISOString(), status: 'deleting' });

    const result = await new SendLibraryReviewRemindersUseCase({ ...h.deps, inbox }).execute(25);

    expect(result).toEqual({ reminded: 1, failed: 0 });
    expect(inbox.items).toEqual([{ workspace_id: WS, user_id: USER, document_id: doc.id, action: 'check_if_still_current' }]);
    expect(h.documents.rows.get(doc.id)?.review_reminded_at).toBe(NOW.toISOString());
  });

  it('does not remind twice for the same due date', async () => {
    const h = buildHarness();
    const inbox = new FakeReviewInbox();
    h.documents.seed({ workspace_id: WS, review_due_at: due.toISOString() });
    const sweep = new SendLibraryReviewRemindersUseCase({ ...h.deps, inbox });
    await sweep.execute(25);
    await sweep.execute(25);
    expect(inbox.items).toHaveLength(1);
  });

  it('logs a failed item and carries on, leaving the document due for the next sweep', async () => {
    const h = buildHarness();
    const inbox = new FakeReviewInbox();
    inbox.fails = true;
    const doc = h.documents.seed({ workspace_id: WS, created_by: OTHER_USER, review_due_at: due.toISOString() });
    const result = await new SendLibraryReviewRemindersUseCase({ ...h.deps, inbox }).execute(25);
    expect(result).toEqual({ reminded: 0, failed: 1 });
    expect(h.documents.rows.get(doc.id)?.review_reminded_at).toBeNull();
    expect(h.log.entries.map((e) => e.event)).toContain('library.review_reminder_failed');
  });
});
