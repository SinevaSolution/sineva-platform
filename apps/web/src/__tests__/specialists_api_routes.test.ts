import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installHeaderSessionResolver } from './fakes/header_session_resolver';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getWorkspaceAgents } from '@/app/api/v1/workspaces/[workspace_id]/agents/route';
import { ListWorkspaceSpecialistsUseCase } from '@/server/application/use-cases/list_workspace_specialists_use_case';
import { UpstreamServiceError, UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import { MUTATING_ROUTE_POLICY } from '@/server/http/route_policy';
import { getOpenApiSpec } from '@/server/infrastructure/openapi/spec';
import { SPECIALIST_MANIFEST } from '@/shared/specialists/manifest';
import { FakeAiEngineGateway } from './fakes/fake_ai_engine_gateway';

const holder = vi.hoisted(() => ({ useCase: null as unknown }));

vi.mock('@/server/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/container')>();
  return {
    ...actual,
    getListWorkspaceSpecialistsUseCase: () => holder.useCase,
  };
});

installHeaderSessionResolver();

const WS_A = '11111111-1111-4111-8111-111111111111';
const WS_B = '22222222-2222-4222-8222-222222222222';
const SRC = resolve(import.meta.dirname, '..');

function request(workspaceId: string, headers: Record<string, string> = {}, query = '') {
  return new NextRequest(`https://app.sineva.id/api/v1/workspaces/${workspaceId}/agents${query}`, {
    headers: {
      'x-test-session-user-id': 'usr-1',
      'x-test-session-role': 'member',
      'x-test-session-workspaces': WS_A,
      ...headers,
    },
  });
}

describe('GET /api/v1/workspaces/{workspace_id}/agents (FR-SPEC-05, 06, 08, 13)', () => {
  let gateway: FakeAiEngineGateway;

  beforeEach(() => {
    gateway = new FakeAiEngineGateway();
    holder.useCase = new ListWorkspaceSpecialistsUseCase(gateway, SPECIALIST_MANIFEST);
  });

  it('returns 200 with the merged roster and the catalog version', async () => {
    const res = await getWorkspaceAgents(request(WS_A), { params: Promise.resolve({ workspace_id: WS_A }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.catalog_version).toBe('cat-test-1');
    expect(json.data.items.map((s: { agent_slug: string }) => s.agent_slug)).toEqual([
      'sinopeople',
      'sinofinance',
      'sinosales',
      'sinosocial',
      'sinohelp',
      'sinoinsights',
    ]);
    expect(json.data.items[0]).toMatchObject({
      accent_key: 'people',
      room_theme_id: 'sinopeople',
      enabled: true,
      my_access: 'available',
    });
    expect(json.data.items[0].copy.id.role_title).toMatch(/^Spesialis /);
  });

  it('returns 503 when sineva-ai is unreachable, never the static roster', async () => {
    gateway.failure = new UpstreamUnavailableError();
    const res = await getWorkspaceAgents(request(WS_A), { params: Promise.resolve({ workspace_id: WS_A }) });
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.success).toBe(false);
    expect(json.data).toBeNull();
  });

  it('returns 502 when sineva-ai answers badly', async () => {
    gateway.failure = new UpstreamServiceError();
    const res = await getWorkspaceAgents(request(WS_A), { params: Promise.resolve({ workspace_id: WS_A }) });
    expect(res.status).toBe(502);
  });

  it('marks specialists a scoped member may not use as unavailable', async () => {
    const res = await getWorkspaceAgents(
      request(WS_A, { 'x-test-specialist-scope': 'selected', 'x-test-session-specialists': 'sinohelp' }),
      { params: Promise.resolve({ workspace_id: WS_A }) },
    );
    const json = await res.json();
    const access = Object.fromEntries(
      json.data.items.map((s: { agent_slug: string; my_access: string }) => [s.agent_slug, s.my_access]),
    );
    expect(access.sinohelp).toBe('available');
    expect(access.sinofinance).toBe('unavailable');
  });

  it('rejects an unknown category_filter with 422', async () => {
    const res = await getWorkspaceAgents(request(WS_A, {}, '?category_filter=astrology'), {
      params: Promise.resolve({ workspace_id: WS_A }),
    });
    expect(res.status).toBe(422);
  });

  it('returns 401 without a session', async () => {
    const res = await getWorkspaceAgents(request(WS_A, { 'x-test-unauthenticated': 'true' }), {
      params: Promise.resolve({ workspace_id: WS_A }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 for a workspace the caller is not a member of, without asking sineva-ai', async () => {
    const res = await getWorkspaceAgents(request(WS_B), { params: Promise.resolve({ workspace_id: WS_B }) });
    expect(res.status).toBe(404);
    expect(gateway.catalogRequests).toHaveLength(0);
  });
});

describe('POST /api/v1/agents is gone (FR-SPEC-06)', () => {
  it('has no route file, so a request gets the framework 404 or 405', () => {
    expect(existsSync(resolve(SRC, 'app/api/v1/agents/route.ts'))).toBe(false);
  });

  it('is absent from the OpenAPI spec, and the workspace route is documented with 502 and 503', () => {
    const openApiSpec = getOpenApiSpec();
    const paths = openApiSpec.paths as Record<string, Record<string, { responses?: Record<string, unknown> }>>;
    expect(paths['/api/v1/agents']).toBeUndefined();
    const documented = paths['/api/v1/workspaces/{workspace_id}/agents']?.get;
    expect(documented).toBeDefined();
    for (const status of ['200', '401', '404', '422', '502', '503']) {
      expect(documented!.responses).toHaveProperty(status);
    }
    expect(JSON.stringify(openApiSpec)).not.toContain('CreateAgentRequest');
  });

  it('has no route policy entry', () => {
    expect(MUTATING_ROUTE_POLICY).not.toHaveProperty('POST /api/v1/agents');
  });

  it('has no seed block, repository or table behind it', () => {
    const seed = readFileSync(resolve(SRC, '../prisma/seed.ts'), 'utf8');
    const schema = readFileSync(resolve(SRC, '../prisma/schema.prisma'), 'utf8');
    expect(seed).not.toMatch(/agentConfig|DEFAULT_SPECIALIZED_AGENTS/);
    expect(schema).not.toMatch(/model AgentConfig|agent_configs/);
    expect(existsSync(resolve(SRC, 'server/infrastructure/database/prisma_agent_repository.ts'))).toBe(false);
    expect(existsSync(resolve(SRC, 'server/domain/repositories/agent_repository.ts'))).toBe(false);
  });
});

describe('the shell reads the manifest, not sineva-ai (ADR-0024)', () => {
  it('loadWorkspaceContext does not call the roster use case or the gateway', () => {
    const source = readFileSync(resolve(SRC, 'app/w/[workspace_slug]/workspace_context.ts'), 'utf8');
    expect(source).not.toMatch(/getGetAgentsUseCase|getListWorkspaceSpecialistsUseCase|listAgents|AiEngineGateway/);
    expect(source).toMatch(/localizeSpecialists/);
  });
});
