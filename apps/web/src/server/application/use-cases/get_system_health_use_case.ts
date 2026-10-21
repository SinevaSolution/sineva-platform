import type { AiEngineGateway } from '@/server/domain/repositories/ai_engine_gateway';
import type { CacheRepository } from '@/server/domain/repositories/cache_repository';
import type { StorageRepository } from '@/server/domain/repositories/storage_repository';

export interface SystemHealthStatus {
  service_name: 'sineva-platform';
  environment: string;
  uptime_seconds: number;
  subsystems: {
    postgresql_prisma: {
      status: 'healthy' | 'standby';
      orm_driver: '@prisma/adapter-pg';
    };
    redis_cache: {
      status: 'healthy' | 'standby';
      client: 'ioredis';
    };
    seaweedfs_s3: {
      status: 'healthy' | 'standby';
      bucket_name: string;
    };
    sineva_ai_engine: {
      status: 'healthy' | 'standby';
      internal_url: string;
      network_mode: 'sineva_internal_bridge_only';
      latency_ms: number;
    };
  };
}

export class GetSystemHealthUseCase {
  constructor(
    private readonly cacheRepository: CacheRepository,
    private readonly storageRepository: StorageRepository,
    private readonly aiEngineGateway: AiEngineGateway,
    private readonly bucketName: string,
  ) {}

  async execute(): Promise<SystemHealthStatus> {
    const [redisHealthy, s3Healthy, aiHealth] = await Promise.all([
      this.cacheRepository.ping(),
      this.storageRepository.checkHealth(),
      this.aiEngineGateway.checkHealth(),
    ]);

    return {
      service_name: 'sineva-platform',
      environment: process.env.NODE_ENV ?? 'development',
      uptime_seconds: Math.floor(process.uptime()),
      subsystems: {
        postgresql_prisma: {
          status: process.env.DATABASE_URL ? 'healthy' : 'standby',
          orm_driver: '@prisma/adapter-pg',
        },
        redis_cache: {
          status: redisHealthy ? 'healthy' : 'standby',
          client: 'ioredis',
        },
        seaweedfs_s3: {
          status: s3Healthy ? 'healthy' : 'standby',
          bucket_name: this.bucketName,
        },
        sineva_ai_engine: {
          status: aiHealth.is_reachable ? 'healthy' : 'standby',
          internal_url: aiHealth.internal_url,
          network_mode: 'sineva_internal_bridge_only',
          latency_ms: aiHealth.latency_ms,
        },
      },
    };
  }
}
