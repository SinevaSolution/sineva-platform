import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getOpenApi } from '@/app/api/openapi.json/route';
import { GET as getHealth } from '@/app/api/v1/health/route';
import { POST as postPresign } from '@/app/api/v1/storage/presign/route';
import { GetSystemHealthUseCase } from '@/server/application/use-cases/get_system_health_use_case';
import { PresignStorageUploadUseCase } from '@/server/application/use-cases/presign_storage_upload_use_case';
import { FakeAiEngineGateway } from './fakes/fake_ai_engine_gateway';
import { FakeCache } from './fakes/fake_cache';
import { FakeDatabaseHealthProbe } from './fakes/fake_database_health_probe';
import { FakeStorage } from './fakes/fake_storage';
import { setCustomSessionResolver } from '@/server/http/with_auth';

// The real container wires Postgres, Redis and S3 adapters, and unit tests
// must run without any of them. Routes are exercised against the real use
// cases backed by the in-memory fakes instead. `vi.mock` is hoisted above the
// imports, so the factory can only reach the holder created with `vi.hoisted`;
// `beforeEach` fills it with fresh fakes so tests cannot see each other's writes.
const container = vi.hoisted(() => ({
  current: null as unknown as {
    presignStorageUpload: unknown;
    systemHealth: unknown;
    aiEngine: FakeAiEngineGateway;
  },
}));

vi.mock('@/server/container', () => ({
  getPresignStorageUploadUseCase: () => container.current.presignStorageUpload,
  getSystemHealthUseCase: () => container.current.systemHealth,
}));

describe('Next.js App Router API v1 Route Handlers', () => {
  beforeEach(() => {
    const cache = new FakeCache();
    const storage = new FakeStorage();
    const aiEngine = new FakeAiEngineGateway();
    const dbProbe = new FakeDatabaseHealthProbe();
    container.current = {
      presignStorageUpload: new PresignStorageUploadUseCase(storage),
      systemHealth: new GetSystemHealthUseCase(
        dbProbe,
        cache,
        storage,
        aiEngine,
        'sineva-assets',
      ),
      aiEngine,
    };

    setCustomSessionResolver(async () => ({
      userId: 'usr_test_123',
      sessionId: 'sess_test_123',
      email: 'test@example.com',
      name: 'Test User',
      emailVerified: true,
      freshUntil: new Date(Date.now() + 60000),
      staffRole: 'operator',
      role: 'owner',
      memberships: [
        {
          workspaceId: 'wks_sineva_01',
          role: 'owner',
          specialistScope: 'all',
        },
      ],
    }));
  });

  it('GET /api/v1/health returns a valid 200 snake_case envelope', async () => {
    const res = await getHealth();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ status: 'healthy' });
    expect(body.meta.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^req_/i,
    );
    expect(body.errors).toBeNull();
  });

  it('POST /api/v1/storage/presign returns 201 presigned SeaweedFS S3 metadata', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/storage/presign',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': 'wks_sineva_01',
        },
        body: JSON.stringify({
          file_name: 'annual_report.pdf',
          content_type: 'application/pdf',
          file_size_bytes: 102400,
        }),
      },
    );

    const res = await postPresign(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.storage_provider).toBe('seaweedfs_s3');
  });

  it('GET /api/openapi.json returns OpenAPI 3.1.0 specification', async () => {
    const res = await getOpenApi();
    const spec = await res.json();

    expect(res.status).toBe(200);
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.paths['/api/v1/health']).toBeDefined();
  });

  it('GET /api/openapi.json documents updated public contract without legacy chat route', async () => {
    const res = await getOpenApi();
    const spec = await res.json();

    // Legacy route removed (WP-M0-28)
    expect(spec.paths['/api/v1/agents/{agent_slug}/chat']).toBeUndefined();

    // Storage presign does not accept workspace_id in body (SEC-2)
    const presignReq = spec.components.schemas.PresignUploadRequest;
    expect(presignReq.required).not.toContain('workspace_id');
    expect(presignReq.properties.workspace_id).toBeUndefined();

    // The registry route moved under the workspace and lost its POST (ADR-0024).
    expect(spec.paths['/api/v1/agents']).toBeUndefined();
    expect(spec.paths['/api/v1/workspaces/{workspace_id}/agents'].get.responses['503']).toBeDefined();
    expect(JSON.stringify(spec)).not.toMatch(/sino[-_]/);
  });
});
