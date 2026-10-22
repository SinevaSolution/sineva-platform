import { beforeEach, describe, expect, it } from 'vitest';
import { ListWorkspaceSpecialistsUseCase } from '@/server/application/use-cases/list_workspace_specialists_use_case';
import type { RequestContext } from '@/server/domain/context/request_context';
import { UpstreamServiceError, UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import { SPECIALIST_MANIFEST } from '@/shared/specialists/manifest';
import { FakeAiEngineGateway, buildCatalogFixture } from './fakes/fake_ai_engine_gateway';

const WAVE_1 = ['sinopeople', 'sinofinance', 'sinosales', 'sinosocial', 'sinohelp', 'sinoinsights'];

function context(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    user_id: 'usr-1',
    workspace_id: 'ws-1',
    role: 'member',
    specialist_scope: 'all',
    session_id: 'sess-1',
    request_id: 'req-1',
    ...overrides,
  };
}

describe('ListWorkspaceSpecialistsUseCase (FR-SPEC-05, FR-SPEC-08, FR-SPEC-13)', () => {
  let gateway: FakeAiEngineGateway;
  let useCase: ListWorkspaceSpecialistsUseCase;

  beforeEach(() => {
    gateway = new FakeAiEngineGateway();
    useCase = new ListWorkspaceSpecialistsUseCase(gateway, SPECIALIST_MANIFEST);
  });

  it('returns the catalog merged with the manifest, in manifest order, with the catalog version', async () => {
    const roster = await useCase.execute({}, context());

    expect(roster.catalog_version).toBe('cat-test-1');
    expect(roster.items.map((s) => s.agent_slug)).toEqual(WAVE_1);
    const finance = roster.items.find((s) => s.agent_slug === 'sinofinance')!;
    expect(finance).toMatchObject({
      handle: 'SinoFinance',
      display_name: 'SinoFinance',
      category: 'finance_ops',
      wave: 1,
      status: 'live',
      accent_key: 'finance',
      room_theme_id: 'sinofinance',
      my_access: 'available',
    });
    expect(finance.copy.id.role_title).toMatch(/^Spesialis /);
    expect(finance.copy.en.starter_prompts).toHaveLength(3);
  });

  it('ignores catalog entries the manifest cannot present (sino, wave 2 coming soon)', async () => {
    const roster = await useCase.execute({}, context());
    const slugs = roster.items.map((s) => s.agent_slug);
    expect(slugs).not.toContain('sino');
    expect(slugs).not.toContain('sinodesk');
  });

  it('derives enabled for the wave 1 specialists the catalog reports live, and says so in no hidden field', async () => {
    const roster = await useCase.execute({}, context());
    expect(roster.items.every((s) => s.enabled)).toBe(true);

    gateway.catalog = {
      ...buildCatalogFixture('cat-test-2'),
      agents: buildCatalogFixture().agents.map((a) =>
        a.agent_slug === 'sinosocial' ? { ...a, status: 'coming_soon' as const } : a,
      ),
    };
    const next = await useCase.execute({}, context());
    expect(next.items.find((s) => s.agent_slug === 'sinosocial')!.enabled).toBe(false);
    expect(next.items.find((s) => s.agent_slug === 'sinofinance')!.enabled).toBe(true);
  });

  it('never returns invented runtime metrics or the removed accent_token', async () => {
    const roster = await useCase.execute({}, context());
    for (const item of roster.items) {
      const keys = Object.keys(item);
      for (const banned of [
        'avg_latency_ms',
        'daily_tokens_used',
        'active_sessions_count',
        'accent_token',
        'model_name',
        'capabilities',
      ]) {
        expect(keys).not.toContain(banned);
      }
    }
  });

  it('lets a member scoped to selected specialists use only those', async () => {
    const roster = await useCase.execute(
      {},
      context({ specialist_scope: 'selected', allowed_specialists: ['sinofinance'] }),
    );
    const access = Object.fromEntries(roster.items.map((s) => [s.agent_slug, s.my_access]));
    expect(access).toEqual({
      sinopeople: 'unavailable',
      sinofinance: 'available',
      sinosales: 'unavailable',
      sinosocial: 'unavailable',
      sinohelp: 'unavailable',
      sinoinsights: 'unavailable',
    });
  });

  it('treats selected scope with no allowed specialists as access to none', async () => {
    const roster = await useCase.execute({}, context({ specialist_scope: 'selected' }));
    expect(roster.items.every((s) => s.my_access === 'unavailable')).toBe(true);
  });

  it('gives a viewer no use access (role matrix: specialist.use is off for viewers)', async () => {
    const roster = await useCase.execute({}, context({ role: 'viewer' }));
    expect(roster.items.every((s) => s.my_access === 'unavailable')).toBe(true);
  });

  it('returns a blocked specialist in the same shape as one that is not enabled (FR-SPEC-13)', async () => {
    gateway.catalog = {
      ...buildCatalogFixture(),
      agents: buildCatalogFixture().agents.map((a) =>
        a.agent_slug === 'sinosocial' ? { ...a, status: 'coming_soon' as const } : a,
      ),
    };
    const roster = await useCase.execute(
      {},
      context({ specialist_scope: 'selected', allowed_specialists: ['sinofinance'] }),
    );
    const blocked = roster.items.find((s) => s.agent_slug === 'sinopeople')!;
    const notEnabled = roster.items.find((s) => s.agent_slug === 'sinosocial')!;
    expect(Object.keys(blocked).sort()).toEqual(Object.keys(notEnabled).sort());
    expect(blocked.my_access).toBe(notEnabled.my_access);
  });

  it('filters by category', async () => {
    const roster = await useCase.execute({ category_filter: 'customer_support' }, context());
    expect(roster.items.map((s) => s.agent_slug)).toEqual(['sinohelp']);
  });

  it('propagates an unreachable sineva-ai as 503 and never answers from the manifest', async () => {
    gateway.failure = new UpstreamUnavailableError();
    await expect(useCase.execute({}, context())).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('propagates a bad catalog answer as 502', async () => {
    gateway.failure = new UpstreamServiceError();
    await expect(useCase.execute({}, context())).rejects.toBeInstanceOf(UpstreamServiceError);
  });

  it('fails with 502 when the catalog does not list a manifest specialist (catalog drift)', async () => {
    gateway.catalog = {
      ...buildCatalogFixture(),
      agents: buildCatalogFixture().agents.filter((a) => a.agent_slug !== 'sinohelp'),
    };
    await expect(useCase.execute({}, context())).rejects.toMatchObject({
      status: 502,
      code: 'catalog_drift',
    });
  });

  it('does not serve a stale roster after a failure: the next success reflects the catalog again', async () => {
    await useCase.execute({}, context());
    gateway.failure = new UpstreamUnavailableError();
    await expect(useCase.execute({}, context())).rejects.toBeInstanceOf(UpstreamUnavailableError);
    gateway.failure = null;
    gateway.catalog = buildCatalogFixture('cat-test-9');
    expect((await useCase.execute({}, context())).catalog_version).toBe('cat-test-9');
  });

  it('asks sineva-ai on every request and reuses the merge for an unchanged catalog_version', async () => {
    const first = await useCase.execute({}, context({ request_id: 'req-a' }));
    const second = await useCase.execute({}, context({ request_id: 'req-b' }));
    expect(gateway.catalogRequests.map((r) => r.requestId)).toEqual(['req-a', 'req-b']);
    // Same merged objects: the merge is memoized, only the per-member access is recomputed.
    expect(second.items[0]!.copy).toBe(first.items[0]!.copy);

    gateway.catalog = buildCatalogFixture('cat-test-2');
    const third = await useCase.execute({}, context());
    expect(third.catalog_version).toBe('cat-test-2');
  });
});
