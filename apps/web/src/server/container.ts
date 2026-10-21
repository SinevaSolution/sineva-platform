import 'server-only';
import { GetAgentsUseCase } from './application/use-cases/get_agents_use_case';
import { GetSystemHealthUseCase } from './application/use-cases/get_system_health_use_case';
import { PresignStorageUploadUseCase } from './application/use-cases/presign_storage_upload_use_case';
import { SendAgentMessageUseCase } from './application/use-cases/send_agent_message_use_case';
import type { AgentRepository } from './domain/repositories/agent_repository';
import type { AiEngineGateway } from './domain/repositories/ai_engine_gateway';
import type { CacheRepository } from './domain/repositories/cache_repository';
import type { DatabaseHealthProbe } from './domain/repositories/database_health_probe';
import type { StorageRepository } from './domain/repositories/storage_repository';
import { RedisCacheRepository } from './infrastructure/cache/redis_cache_repository';
import { getEnvConfig } from './infrastructure/config/env';
import { PrismaAgentRepository } from './infrastructure/database/prisma_agent_repository';
import { PrismaDatabaseHealthProbe } from './infrastructure/database/prisma_database_health_probe';
import { getPrismaClient } from './infrastructure/database/prisma_client';
import { InternalAiEngineGateway } from './infrastructure/gateways/internal_ai_engine_gateway';
import { SeaweedStorageRepository } from './infrastructure/storage/seaweed_storage_repository';

// Composition root: the only module that knows which concrete adapter backs
// each port. Route handlers and pages ask for use cases here instead of
// importing infrastructure, so swapping an adapter is a one-line change.
//
// Everything is built on first use rather than at import time. Adapter
// constructors read env and may open connections; doing that on import would
// make `next build` (which imports every route module to collect page data)
// touch real infrastructure, and would make env-dependent tests order-sensitive.

function memoize<T>(factory: () => T): () => T {
  let instance: T | null = null;
  return () => {
    if (instance === null) {
      instance = factory();
    }
    return instance;
  };
}

// Adapters are memoized because they hold resources that must be shared across
// requests: the Prisma client owns the Postgres connection pool, and the cache
// and storage adapters own their clients.
const getAgentRepository = memoize<AgentRepository>(
  () => new PrismaAgentRepository(getPrismaClient()),
);
const getDatabaseHealthProbe = memoize<DatabaseHealthProbe>(
  () => new PrismaDatabaseHealthProbe(getPrismaClient()),
);
const getCacheRepository = memoize<CacheRepository>(
  () => new RedisCacheRepository(),
);
const getAiEngineGateway = memoize<AiEngineGateway>(
  () => new InternalAiEngineGateway(),
);
const getStorageRepository = memoize<StorageRepository>(
  () => new SeaweedStorageRepository(),
);

export { getPrismaClient };

export const getGetAgentsUseCase = memoize(
  () => new GetAgentsUseCase(getAgentRepository(), getCacheRepository()),
);

export const getSendAgentMessageUseCase = memoize(
  () => new SendAgentMessageUseCase(getAgentRepository(), getAiEngineGateway()),
);

export const getPresignStorageUploadUseCase = memoize(
  () => new PresignStorageUploadUseCase(getStorageRepository()),
);

export const getSystemHealthUseCase = memoize(
  () =>
    new GetSystemHealthUseCase(
      getDatabaseHealthProbe(),
      getCacheRepository(),
      getStorageRepository(),
      getAiEngineGateway(),
      getEnvConfig().s3_bucket_name,
    ),
);
