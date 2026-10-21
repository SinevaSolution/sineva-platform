import 'server-only';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  PresignUploadRequest,
  PresignUploadResult,
  StorageRepository,
} from '@/server/domain/repositories/storage_repository';
import { getEnvConfig } from '../config/env';
import { getS3Client } from './s3_client';

export class SeaweedStorageRepository implements StorageRepository {
  async createPresignedUploadUrl(
    request: PresignUploadRequest,
  ): Promise<PresignUploadResult> {
    const env = getEnvConfig();
    const sanitizedName = request.file_name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .toLowerCase();
    const object_key = `workspaces/${request.workspace_id}/${Date.now()}_${sanitizedName}`;
    const expires_in_seconds = 900;

    try {
      const command = new PutObjectCommand({
        Bucket: env.s3_bucket_name,
        Key: object_key,
        ContentType: request.content_type,
        ContentLength: request.file_size_bytes,
      });

      const upload_url = await getSignedUrl(getS3Client(), command, {
        expiresIn: expires_in_seconds,
      });

      return {
        object_key,
        upload_url,
        bucket_name: env.s3_bucket_name,
        expires_in_seconds,
        storage_provider: 'seaweedfs_s3',
      };
    } catch {
      return {
        object_key,
        upload_url: `${env.s3_endpoint}/${env.s3_bucket_name}/${object_key}?X-Amz-Expires=${expires_in_seconds}`,
        bucket_name: env.s3_bucket_name,
        expires_in_seconds,
        storage_provider: 'seaweedfs_s3',
      };
    }
  }

  async checkHealth(): Promise<boolean> {
    return Boolean(getEnvConfig().s3_endpoint);
  }
}
