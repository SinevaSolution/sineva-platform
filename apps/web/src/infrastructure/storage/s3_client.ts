import { S3Client } from '@aws-sdk/client-s3';
import { getEnvConfig } from '../config/env';

let s3ClientInstance: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    const env = getEnvConfig();
    s3ClientInstance = new S3Client({
      endpoint: env.s3_endpoint,
      region: env.s3_region,
      forcePathStyle: env.s3_force_path_style,
      credentials: {
        accessKeyId: env.s3_access_key_id,
        secretAccessKey: env.s3_secret_access_key,
      },
    });
  }
  return s3ClientInstance;
}
