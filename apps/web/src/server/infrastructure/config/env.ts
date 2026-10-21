import 'server-only';

export interface AppEnvConfig {
  node_env: string;
  database_url: string;
  redis_url: string;
  redis_key_prefix: string;
  s3_endpoint: string;
  s3_public_endpoint: string;
  s3_region: string;
  s3_access_key_id: string;
  s3_secret_access_key: string;
  s3_bucket_name: string;
  s3_force_path_style: boolean;
  ai_engine_internal_url: string;
  ai_engine_internal_api_key: string;
  ai_engine_timeout_ms: number;
}

export function getEnvConfig(): AppEnvConfig {
  return {
    node_env: process.env.NODE_ENV ?? 'development',
    database_url:
      process.env.DATABASE_URL ??
      'postgresql://sineva_user:sineva_secret_password@localhost:5432/sineva_platform',
    redis_url: process.env.REDIS_URL ?? 'redis://localhost:6379/0',
    redis_key_prefix: process.env.REDIS_KEY_PREFIX ?? 'sineva:platform:',
    s3_endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:8333',
    s3_public_endpoint:
      process.env.S3_PUBLIC_ENDPOINT ??
      process.env.S3_ENDPOINT ??
      'http://localhost:8333',
    s3_region: process.env.S3_REGION ?? 'us-east-1',
    s3_access_key_id: process.env.S3_ACCESS_KEY_ID ?? 'sineva_s3_key',
    s3_secret_access_key:
      process.env.S3_SECRET_ACCESS_KEY ?? 'sineva_s3_secret',
    s3_bucket_name: process.env.S3_BUCKET_NAME ?? 'sineva-assets',
    s3_force_path_style: process.env.S3_FORCE_PATH_STYLE !== 'false',
    ai_engine_internal_url:
      process.env.AI_ENGINE_INTERNAL_URL ?? 'http://sineva-ai:8000',
    ai_engine_internal_api_key:
      process.env.AI_ENGINE_INTERNAL_API_KEY ??
      'sineva_internal_service_token_dev',
    ai_engine_timeout_ms: Number(process.env.AI_ENGINE_TIMEOUT_MS ?? '15000'),
  };
}
