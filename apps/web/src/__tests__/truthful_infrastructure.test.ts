import { installHeaderSessionResolver } from './fakes/header_session_resolver';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getHealth } from '@/app/api/v1/health/route';
import { POST as postPresign } from '@/app/api/v1/storage/presign/route';
import { GetSystemHealthUseCase } from '@/server/application/use-cases/get_system_health_use_case';
import { PresignStorageUploadUseCase } from '@/server/application/use-cases/presign_storage_upload_use_case';
import { UpstreamServiceError } from '@/server/domain/errors/domain_error';
import { InternalAiEngineGateway } from '@/server/infrastructure/gateways/internal_ai_engine_gateway';
import { RedisCacheRepository } from '@/server/infrastructure/cache/redis_cache_repository';
import { SeaweedStorageRepository } from '@/server/infrastructure/storage/seaweed_storage_repository';
import { FakeAiEngineGateway } from './fakes/fake_ai_engine_gateway';
import { FakeCache } from './fakes/fake_cache';
import { FakeDatabaseHealthProbe } from './fakes/fake_database_health_probe';
import { FakeStorage } from './fakes/fake_storage';

class ThrowingSignerStorage extends FakeStorage {
  override async createPresignedUploadUrl(): Promise<never> {
    throw new UpstreamServiceError('Failed to generate presigned upload URL from S3');
  }
}

const mockContainer = vi.hoisted(() => ({
  current: null as unknown as {
    systemHealth: unknown;
    presignStorageUpload: unknown;
  },
}));

vi.mock('@/server/container', () => ({
  getSystemHealthUseCase: () => mockContainer.current.systemHealth,
  getPresignStorageUploadUseCase: () => mockContainer.current.presignStorageUpload,
  getSendAgentMessageUseCase: vi.fn(),
}));

installHeaderSessionResolver();

describe('WP-M0-08: Truthful Infrastructure (H4)', () => {
  let dbProbe: FakeDatabaseHealthProbe;
  let cache: FakeCache;
  let storage: FakeStorage;
  let aiEngine: FakeAiEngineGateway;

  beforeEach(() => {
    dbProbe = new FakeDatabaseHealthProbe();
    cache = new FakeCache();
    storage = new FakeStorage();
    aiEngine = new FakeAiEngineGateway();

    mockContainer.current = {
      systemHealth: new GetSystemHealthUseCase(
        dbProbe,
        cache,
        storage,
        aiEngine,
        'sineva-assets',
      ),
      presignStorageUpload: new PresignStorageUploadUseCase(storage),
    };
  });

  describe('Health Probes and Privacy (INF-3, INF-4, SEC-7)', () => {
    it('returns 200 with status "healthy" when all probes succeed', async () => {
      const res = await getHealth();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ status: 'healthy' });
    });

    it('conceals internal addresses, bucket names, and URLs from public health body', async () => {
      const res = await getHealth();
      const bodyText = await res.text();

      expect(bodyText).not.toContain('http://sineva-ai:8000');
      expect(bodyText).not.toContain('http://fake-ai-engine');
      expect(bodyText).not.toContain('sineva-assets');
      expect(bodyText).not.toContain('postgresql_prisma');
      expect(bodyText).not.toContain('redis_cache');
      expect(bodyText).not.toContain('uptime_seconds');
    });

    it('returns 503 and status "standby" when Postgres probe fails', async () => {
      dbProbe.isHealthy = false;

      const res = await getHealth();
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.success).toBe(false);
      expect(body.code).toBe('dependency_unavailable');
      expect(body.data).toEqual({ status: 'standby' });
    });

    it('returns 503 and status "standby" when Redis probe fails', async () => {
      cache.isHealthy = false;

      const res = await getHealth();
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.success).toBe(false);
      expect(body.code).toBe('dependency_unavailable');
      expect(body.data).toEqual({ status: 'standby' });
    });

    it('returns 503 and status "standby" when S3 probe fails', async () => {
      storage.isHealthy = false;

      const res = await getHealth();
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.success).toBe(false);
      expect(body.code).toBe('dependency_unavailable');
      expect(body.data).toEqual({ status: 'standby' });
    });

    it('returns 503 and status "standby" when sineva-ai probe fails', async () => {
      aiEngine.healthResult = {
        is_reachable: false,
        internal_url: 'http://sineva-ai:8000',
        latency_ms: 10,
        engine_version: 'standby',
      };

      const res = await getHealth();
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.success).toBe(false);
      expect(body.code).toBe('dependency_unavailable');
      expect(body.data).toEqual({ status: 'standby' });
    });
  });

  describe('Presign Fixes (INF-2, INF-5)', () => {
    it('returns 502 instead of 201 when storage presigner throws an error', async () => {
      mockContainer.current.presignStorageUpload = new PresignStorageUploadUseCase(
        new ThrowingSignerStorage(),
      );

      const req = new NextRequest('http://localhost:3000/api/v1/storage/presign', {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: 'wks_sineva_01',
          file_name: 'annual_report.pdf',
          content_type: 'application/pdf',
          file_size_bytes: 102400,
        }),
      });

      const res = await postPresign(req);
      const body = await res.json();

      expect(res.status).toBe(502);
      expect(body.success).toBe(false);
      expect(body.code).toBe('model_unavailable');
    });

    it('presigned URL host matches S3_PUBLIC_ENDPOINT rather than internal docker host (INF-5)', async () => {
      const originalPublicEndpoint = process.env.S3_PUBLIC_ENDPOINT;
      process.env.S3_PUBLIC_ENDPOINT = 'http://localhost:8333';
      try {
        const seaweed = new SeaweedStorageRepository();
        const result = await seaweed.createPresignedUploadUrl({
          workspace_id: '11111111-1111-4111-8111-111111111111',
          file_name: 'document.pdf',
          content_type: 'application/pdf',
          file_size_bytes: 1024,
        });

        const url = new URL(result.upload_url);
        expect(url.origin).toBe('http://localhost:8333');
      } finally {
        if (originalPublicEndpoint !== undefined) {
          process.env.S3_PUBLIC_ENDPOINT = originalPublicEndpoint;
        } else {
          delete process.env.S3_PUBLIC_ENDPOINT;
        }
      }
    });
  });

  describe('Engine Version Extraction from Real Probe (INF-4)', () => {
    it('parses real engine_version from upstream sineva-ai health response', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              service_name: 'sineva-ai',
              version: '2.4.1',
              status: 'healthy',
            },
          }),
        } as unknown as Response);

        const gateway = new InternalAiEngineGateway();
        const health = await gateway.checkHealth();

        expect(health.is_reachable).toBe(true);
        expect(health.engine_version).toBe('2.4.1');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns "standby" version when upstream check fails', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

        const gateway = new InternalAiEngineGateway();
        const health = await gateway.checkHealth();

        expect(health.is_reachable).toBe(false);
        expect(health.engine_version).toBe('standby');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Cache Invalidation of Pattern/Prefix (DOM-2)', () => {
    it('delByPrefix clears every key under the prefix and keeps unrelated keys', async () => {
      const cacheRepo = new FakeCache();

      await cacheRepo.set('lists:p_1:pp_10:cat_all', { items: [] });
      await cacheRepo.set('lists:p_2:pp_10:cat_all', { items: [] });
      await cacheRepo.set('lists:p_1:pp_10:cat_finance_ops', { items: [] });
      await cacheRepo.set('detail:sinopeople', { name: 'SinoPeople' });

      await cacheRepo.delByPrefix('lists:');

      expect(await cacheRepo.get('lists:p_1:pp_10:cat_all')).toBeNull();
      expect(await cacheRepo.get('lists:p_2:pp_10:cat_all')).toBeNull();
      expect(await cacheRepo.get('lists:p_1:pp_10:cat_finance_ops')).toBeNull();
      expect(await cacheRepo.get('detail:sinopeople')).not.toBeNull();
    });
  });

  describe('Redis Cache Repository Real Implementation (INF-1)', () => {
    it('ping() returns false when client fails', async () => {
      const fakeRedis = {
        ping: vi.fn().mockRejectedValue(new Error('Connection refused')),
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        scanStream: vi.fn(),
      } as unknown as import('ioredis').default;

      const redisCache = new RedisCacheRepository(fakeRedis);
      const isUp = await redisCache.ping();

      expect(isUp).toBe(false);
      expect(fakeRedis.ping).toHaveBeenCalled();
    });

    it('ping() returns true when client responds with PONG', async () => {
      const fakeRedis = {
        ping: vi.fn().mockResolvedValue('PONG'),
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        scanStream: vi.fn(),
      } as unknown as import('ioredis').default;

      const redisCache = new RedisCacheRepository(fakeRedis);
      const isUp = await redisCache.ping();

      expect(isUp).toBe(true);
    });

    it('delByPrefix scans with prefix and deletes matching keys', async () => {
      async function* mockStream() {
        yield ['sineva:platform:test:k1', 'sineva:platform:test:k2'];
      }

      const fakeRedis = {
        scanStream: vi.fn().mockReturnValue(mockStream()),
        del: vi.fn().mockResolvedValue(2),
        ping: vi.fn(),
        get: vi.fn(),
        set: vi.fn(),
      } as unknown as import('ioredis').default;

      const redisCache = new RedisCacheRepository(fakeRedis);
      await redisCache.delByPrefix('test:');

      expect(fakeRedis.scanStream).toHaveBeenCalledWith({
        match: 'sineva:platform:test:*',
        count: 100,
      });
      expect(fakeRedis.del).toHaveBeenCalledWith(
        'sineva:platform:test:k1',
        'sineva:platform:test:k2',
      );
    });
  });
});
