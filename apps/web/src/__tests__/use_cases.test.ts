import { describe, expect, it } from 'vitest';
import { GetAgentsUseCase } from '@/application/use-cases/get_agents_use_case';
import { GetSystemHealthUseCase } from '@/application/use-cases/get_system_health_use_case';
import { PresignStorageUploadUseCase } from '@/application/use-cases/presign_storage_upload_use_case';
import { SendAgentMessageUseCase } from '@/application/use-cases/send_agent_message_use_case';
import { NotFoundError } from '@/domain/errors/domain_error';
import { RedisCacheRepository } from '@/infrastructure/cache/redis_cache_repository';
import { DrizzleAgentRepository } from '@/infrastructure/database/client';
import { InternalAiEngineGateway } from '@/infrastructure/gateways/internal_ai_engine_gateway';
import { SeaweedStorageRepository } from '@/infrastructure/storage/seaweed_storage_repository';

describe('Clean Architecture Use Cases', () => {
  it('lists all 6 default specialized companions and filters by category', async () => {
    const repo = new DrizzleAgentRepository();
    const cache = new RedisCacheRepository();
    const useCase = new GetAgentsUseCase(repo, cache);

    const allResult = await useCase.execute({ page: 1, per_page: 10 });
    expect(allResult.total_items).toBe(6);
    expect(allResult.items.map((a) => a.agent_slug)).toContain('sino-finance');
    expect(allResult.items.map((a) => a.agent_slug)).toContain('sino-people');

    const financeOnly = await useCase.execute({
      page: 1,
      per_page: 10,
      category_filter: 'finance_ops',
    });
    expect(financeOnly.total_items).toBe(1);
    expect(financeOnly.items[0]?.display_name).toBe('SinoFinance');
  });

  it('dispatches a chat message to an existing companion and throws NotFoundError for unknown slug', async () => {
    const repo = new DrizzleAgentRepository();
    const gateway = new InternalAiEngineGateway();
    const useCase = new SendAgentMessageUseCase(repo, gateway);

    const reply = await useCase.execute({
      agent_slug: 'sino-finance',
      session_id: 'ses_test_01',
      user_id: 'usr_test_01',
      message_text: 'Reconcile Q3 ledger balances',
    });

    expect(reply.agent_slug).toBe('sino-finance');
    expect(reply.reply_text).toContain('@SinoFinance');
    expect(reply.suggested_actions.length).toBeGreaterThan(0);

    await expect(
      useCase.execute({
        agent_slug: 'unknown-companion',
        session_id: 'ses_test_01',
        user_id: 'usr_test_01',
        message_text: 'Hello',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('generates a SeaweedFS S3 presigned upload URL with sanitized object_key', async () => {
    const storageRepo = new SeaweedStorageRepository();
    const useCase = new PresignStorageUploadUseCase(storageRepo);

    const result = await useCase.execute({
      workspace_id: 'wks_enterprise_01',
      file_name: 'Q4 Financial Model.xlsx',
      content_type:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      file_size_bytes: 512000,
    });

    expect(result.storage_provider).toBe('seaweedfs_s3');
    expect(result.object_key).toContain(
      'workspaces/wks_enterprise_01/',
    );
    expect(result.object_key).toContain('q4_financial_model.xlsx');
    expect(result.upload_url).toContain('http');
  });

  it('reports system health for shared PostgreSQL, Redis, SeaweedFS, and internal sineva-ai', async () => {
    const cache = new RedisCacheRepository();
    const storage = new SeaweedStorageRepository();
    const gateway = new InternalAiEngineGateway();
    const useCase = new GetSystemHealthUseCase(
      cache,
      storage,
      gateway,
      'sineva-assets',
    );

    const health = await useCase.execute();
    expect(health.service_name).toBe('sineva-platform');
    expect(health.subsystems.redis_cache.status).toBe('healthy');
    expect(health.subsystems.seaweedfs_s3.bucket_name).toBe('sineva-assets');
    expect(health.subsystems.sineva_ai_engine.network_mode).toBe(
      'sineva_internal_bridge_only',
    );
  });
});
