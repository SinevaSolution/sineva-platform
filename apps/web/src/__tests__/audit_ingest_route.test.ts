import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postIngest } from '@/app/internal/v1/audit-events/route';
import { POST as postApiIngest } from '@/app/api/internal/v1/audit-events/route';
import { IngestAuditEventUseCase } from '@/server/application/use-cases/audit/ingest_audit_event_use_case';
import { RepositoryAuditLogger } from '@/server/application/audit/repository_audit_logger';
import type { WorkspaceEntity } from '@/server/domain/entities/workspace';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import * as container from '@/server/container';
import * as envModule from '@/server/infrastructure/config/env';
import { getOpenApiSpec } from '@/server/infrastructure/openapi/spec';
import { FakeAuditEventRepository } from './fakes/fake_audit_event_repository';

const KNOWN_WS = '11111111-1111-4111-8111-111111111111';
const UNKNOWN_WS = '99999999-9999-4999-8999-999999999999';

const workspaces = {
  findById: async (id: string) => (id === KNOWN_WS ? ({ id } as WorkspaceEntity) : null),
} as unknown as WorkspaceRepository;

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    workspace_id: KNOWN_WS,
    actor_type: 'system',
    actor_id: 'sineva-ai',
    action: 'session.access_denied',
    target_type: 'session',
    target_id: 'sess-123',
    outcome: 'denied',
    reason_code: 'ownership_mismatch',
    request_id: 'req-ai-1',
    run_id: 'run-9',
    metadata: { agent_slug: 'sinosales' },
    ...overrides,
  };
}

function request(body: unknown, key: string | null = 'test-secret-key-primary', path = '/internal/v1/audit-events') {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(key ? { 'x-internal-api-key': key } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /internal/v1/audit-events (WP-M0-33 task 5)', () => {
  let repo: FakeAuditEventRepository;

  beforeEach(() => {
    repo = new FakeAuditEventRepository();
    vi.spyOn(container, 'getIngestAuditEventUseCase').mockReturnValue(
      new IngestAuditEventUseCase(workspaces, new RepositoryAuditLogger(repo)),
    );
    vi.spyOn(envModule, 'getEnvConfig').mockReturnValue({
      ai_engine_internal_api_key: 'test-secret-key-primary',
      ai_engine_internal_api_key_next: 'test-secret-key-secondary',
    } as ReturnType<typeof envModule.getEnvConfig>);
  });

  it('rejects a missing X-Internal-Api-Key with 401 and writes nothing', async () => {
    const res = await postIngest(request(validBody(), null));

    expect(res.status).toBe(401);
    expect(repo.rows).toHaveLength(0);
  });

  it('rejects a wrong X-Internal-Api-Key with 401', async () => {
    expect((await postIngest(request(validBody(), 'guess'))).status).toBe(401);
  });

  it('accepts the rotation key as well', async () => {
    expect((await postIngest(request(validBody(), 'test-secret-key-secondary'))).status).toBe(201);
  });

  it('stores the sineva-ai event for an existing workspace', async () => {
    const res = await postIngest(request(validBody()));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toEqual({ accepted: true });
    expect(repo.rows[0]).toMatchObject({
      workspace_id: KNOWN_WS,
      actor_type: 'system',
      actor_id: 'sineva-ai',
      action: 'session.access_denied',
      outcome: 'denied',
      reason_code: 'ownership_mismatch',
      run_id: 'run-9',
      request_id: 'req-ai-1',
      metadata: { agent_slug: 'sinosales' },
    });
  });

  it('rejects an unknown workspace with 404 and writes nothing', async () => {
    const res = await postIngest(request(validBody({ workspace_id: UNKNOWN_WS })));

    expect(res.status).toBe(404);
    expect(repo.rows).toHaveLength(0);
  });

  it('accepts an event with no workspace (context.verification_failed has none to trust)', async () => {
    const res = await postIngest(
      request(validBody({ workspace_id: undefined, action: 'context.verification_failed' })),
    );

    expect(res.status).toBe(201);
    expect(repo.rows[0]?.workspace_id).toBeNull();
  });

  it.each([
    ['a user actor (sineva-ai cannot speak for a user)', { actor_type: 'user' }],
    ['a caller-supplied hash', { hash: 'a'.repeat(64) }],
    ['a non-dotted action', { action: 'DROP TABLE' }],
    ['a bad outcome', { outcome: 'maybe' }],
    ['a non-uuid workspace', { workspace_id: 'not-a-uuid' }],
  ])('rejects %s with 422', async (_label, overrides) => {
    const res = await postIngest(request(validBody(overrides)));

    expect(res.status).toBe(422);
    expect(repo.rows).toHaveLength(0);
  });

  it('redacts content-like metadata keys before storing', async () => {
    await postIngest(request(validBody({ metadata: { content: 'customer text', agent_slug: 'sinohelp' } })));

    expect(repo.rows[0]?.metadata).toEqual({ content: '[redacted]', agent_slug: 'sinohelp' });
  });

  it('serves the same handler under /api/internal/v1/audit-events', async () => {
    const res = await postApiIngest(request(validBody(), 'test-secret-key-primary', '/api/internal/v1/audit-events'));

    expect(res.status).toBe(201);
  });

  it('is documented in the OpenAPI spec (R-25)', () => {
    const spec = getOpenApiSpec() as { paths: Record<string, Record<string, unknown>> };

    expect(spec.paths['/internal/v1/audit-events']?.post).toBeDefined();
    expect(spec.paths['/api/internal/v1/audit-events']?.post).toBeDefined();
  });
});
