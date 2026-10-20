import { GetSystemHealthUseCase } from '@/application/use-cases/get_system_health_use_case';
import { defaultCacheRepository } from '@/infrastructure/cache/redis_cache_repository';
import { getEnvConfig } from '@/infrastructure/config/env';
import { defaultAiEngineGateway } from '@/infrastructure/gateways/internal_ai_engine_gateway';
import { defaultStorageRepository } from '@/infrastructure/storage/seaweed_storage_repository';
import {
  handleRouteError,
  sendSuccessJson,
} from '@/presentation/http/response_helper';

export async function GET() {
  try {
    const env = getEnvConfig();
    const useCase = new GetSystemHealthUseCase(
      defaultCacheRepository,
      defaultStorageRepository,
      defaultAiEngineGateway,
      env.s3_bucket_name,
    );

    const healthData = await useCase.execute();
    return sendSuccessJson({
      data: healthData,
      message: 'Sineva platform and shared infrastructure health verified',
      status: 200,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
