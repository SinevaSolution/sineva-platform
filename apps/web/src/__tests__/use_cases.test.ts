import { describe, expect, it } from 'vitest';
import { GetAgentsUseCase } from '@/server/application/use-cases/get_agents_use_case';
import { GetSystemHealthUseCase } from '@/server/application/use-cases/get_system_health_use_case';
import { PresignStorageUploadUseCase } from '@/server/application/use-cases/presign_storage_upload_use_case';
import { SendAgentMessageUseCase } from '@/server/application/use-cases/send_agent_message_use_case';
import {
  NotFoundError,
  UpstreamUnavailableError,
} from '@/server/domain/errors/domain_error';
import { FakeAgentRepository } from './fakes/fake_agent_repository';
import { FakeAiEngineGateway } from './fakes/fake_ai_engine_gateway';
import { FakeCache } from './fakes/fake_cache';
import { FakeDatabaseHealthProbe } from './fakes/fake_database_health_probe';
import { FakeStorage } from './fakes/fake_storage';

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

  it('dispatches a chat message to an existing companion and throws NotFoundError for unknown slug', async () => {
    const repo = new FakeAgentRepository();
    const gateway = new FakeAiEngineGateway();
    const useCase = new SendAgentMessageUseCase(repo, gateway);

    const request = {
      agent_slug: 'sinofinance',
      session_id: '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3',
      user_id: 'usr_test_01',
      message_text: 'Reconcile Q3 ledger balances',
    };
    const reply = await useCase.execute(request);

    expect(reply.agent_slug).toBe('sinofinance');
    expect(reply.reply_content).toContain('Reconcile Q3 ledger balances');
    expect(reply.session_id).toBe(request.session_id);
    expect(gateway.requests).toEqual([request]);

    await expect(
      useCase.execute({
        agent_slug: 'unknown-companion',
        user_id: 'usr_test_01',
        message_text: 'Hello',
      }),
    ).rejects.toThrow(NotFoundError);
    // An unknown companion must be rejected before anything reaches the engine.
    expect(gateway.requests).toHaveLength(1);
  });

  it('propagates gateway failures instead of masking them', async () => {
    const gateway = new FakeAiEngineGateway();
    gateway.failure = new UpstreamUnavailableError();
    const useCase = new SendAgentMessageUseCase(
      new FakeAgentRepository(),
      gateway,
    );

    await expect(
      useCase.execute({
        agent_slug: 'sinofinance',
        user_id: 'usr_test_01',
        message_text: 'Hello',
      }),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
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
