import 'server-only';
import { HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UpstreamServiceError } from '@/server/domain/errors/domain_error';
import { buildStorageKey } from '@/server/domain/tenancy/tenant_isolation';
import type {
  PresignUploadRequest,
  PresignUploadResult,
  StorageRepository,
} from '@/server/domain/repositories/storage_repository';
import { getEnvConfig } from '../config/env';
import { getS3Client, getS3SignerClient } from './s3_client';
import { logger } from '../logging/logger';

const S3_HEALTH_TIMEOUT_MS = 1500;

export class SeaweedStorageRepository implements StorageRepository {
  async createPresignedUploadUrl(
    request: PresignUploadRequest,
  ): Promise<PresignUploadResult> {
    const env = getEnvConfig();
    const sanitizedName = request.file_name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .toLowerCase();
    const object_key = buildStorageKey(
      request.workspace_id,
      `${Date.now()}_${sanitizedName}`,
    );
    const expires_in_seconds = 900;

    try {
      const command = new PutObjectCommand({
        Bucket: env.s3_bucket_name,
        Key: object_key,
        ContentType: request.content_type,
        ContentLength: request.file_size_bytes,
      });

      const upload_url = await getSignedUrl(getS3SignerClient(), command, {
        expiresIn: expires_in_seconds,
      });

      return {
        object_key,
        upload_url,
        bucket_name: env.s3_bucket_name,
        expires_in_seconds,
        storage_provider: 'seaweedfs_s3',
      };
    } catch (error) {
      // INF-2: Never return an unsigned URL on failure (R-26). Throw typed 502 UpstreamServiceError.
      logger.error('storage.presign_failed', { reason: error instanceof Error ? error.name : 'unknown' });
      throw new UpstreamServiceError(
        'Failed to generate presigned upload URL from storage service',
      );
    }
  }

  async checkHealth(): Promise<boolean> {
    const env = getEnvConfig();
    if (!env.s3_endpoint || !env.s3_bucket_name) {
      return false;
    }

    try {
      const command = new HeadBucketCommand({
        Bucket: env.s3_bucket_name,
      });
      const probePromise = getS3Client().send(command);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('S3 health probe timed out')),
          S3_HEALTH_TIMEOUT_MS,
        );
      });
      await Promise.race([probePromise, timeoutPromise]);
      return true;
    } catch {
      return false;
    }
  }
}
