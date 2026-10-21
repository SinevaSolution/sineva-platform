import { describe, expect, it } from 'vitest';
import { GetAgentsUseCase } from '@/server/application/use-cases/get_agents_use_case';
import { GetSystemHealthUseCase } from '@/server/application/use-cases/get_system_health_use_case';
import { PresignStorageUploadUseCase } from '@/server/application/use-cases/presign_storage_upload_use_case';
import { FakeAgentRepository } from './fakes/fake_agent_repository';
import { FakeCache } from './fakes/fake_cache';
import { FakeDatabaseHealthProbe } from './fakes/fake_database_health_probe';
import { FakeStorage } from './fakes/fake_storage';
import { FakeAiEngineGateway } from './fakes/fake_ai_engine_gateway';

describe('Clean Architecture Use Cases', () => {
  it('lists all 6 default specialized companions and filters by category', async () => {
    const repo = new FakeAgentRepository();
    const cache = new FakeCache();
    const useCase = new GetAgentsUseCase(repo, cache);

    const allResult = await useCase.execute({ page: 1, per_page: 10 });
    expect(allResult.total_items).toBe(6);
    expect(allResult.items.map((a) => a.agent_slug)).toContain('sinofinance');
    expect(allResult.items.map((a) => a.agent_slug)).toContain('sinopeople');

    const financeOnly = await useCase.execute({
      page: 1,
      per_page: 10,
      category_filter: 'finance_ops',
    });
    expect(financeOnly.total_items).toBe(1);
    expect(financeOnly.items[0]?.display_name).toBe('SinoFinance');
  });

  it('delegates presigned upload URL generation to the storage port', async () => {
    const storage = new FakeStorage();
    const useCase = new PresignStorageUploadUseCase(storage);

    const request = {
      workspace_id: 'wks_enterprise_01',
      file_name: 'Q4 Financial Model.xlsx',
      content_type:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      file_size_bytes: 512000,
    };
    const result = await useCase.execute(request);

    expect(storage.requests).toEqual([request]);
    expect(result.storage_provider).toBe('seaweedfs_s3');
    expect(result.object_key).toContain('workspaces/wks_enterprise_01/');
    expect(result.upload_url).toContain('http');
  });

  it('reports system health for shared PostgreSQL, Redis, SeaweedFS, and internal sineva-ai', async () => {
    const useCase = new GetSystemHealthUseCase(
      new FakeDatabaseHealthProbe(),
      new FakeCache(),
      new FakeStorage(),
      new FakeAiEngineGateway(),
      'sineva-assets',
    );

    const health = await useCase.execute();
    expect(health.status).toBe('healthy');
    expect(health.service_name).toBe('sineva-platform');
    expect(health.subsystems.postgresql_prisma.status).toBe('healthy');
    expect(health.subsystems.redis_cache.status).toBe('healthy');
    expect(health.subsystems.seaweedfs_s3.bucket_name).toBe('sineva-assets');
    expect(health.subsystems.sineva_ai_engine.network_mode).toBe(
      'sineva_internal_bridge_only',
    );
  });
});
