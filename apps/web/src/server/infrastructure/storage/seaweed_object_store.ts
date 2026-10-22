import 'server-only';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UpstreamServiceError } from '@/server/domain/errors/domain_error';
import type { ObjectStore, PresignedPut } from '@/server/domain/repositories/object_store';
import { getEnvConfig } from '../config/env';
import { logger } from '../logging/logger';
import { getS3Client, getS3SignerClient } from './s3_client';

function storageFailure(event: 'storage.object_failed', error: unknown): UpstreamServiceError {
  logger.error(event, { reason: error instanceof Error ? error.name : 'unknown' });
  return new UpstreamServiceError('The storage service did not complete the request');
}

function isMissing(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  return name === 'NoSuchKey' || name === 'NotFound';
}

export class SeaweedObjectStore implements ObjectStore {
  async createPresignedPut(input: {
    key: string;
    content_type: string;
    size_bytes: number;
    expires_in_seconds: number;
  }): Promise<PresignedPut> {
    try {
      const command = new PutObjectCommand({
        Bucket: getEnvConfig().s3_bucket_name,
        Key: input.key,
        ContentType: input.content_type,
        // Signed, so the browser cannot send a different length than declared.
        ContentLength: input.size_bytes,
      });
      const upload_url = await getSignedUrl(getS3SignerClient(), command, {
        expiresIn: input.expires_in_seconds,
      });
      return { upload_url, expires_in_seconds: input.expires_in_seconds };
    } catch (error) {
      // Never return an unsigned URL on failure (R-26).
      throw storageFailure('storage.object_failed', error);
    }
  }

  async getObject(key: string, max_bytes: number): Promise<Uint8Array | null> {
    try {
      const response = await getS3Client().send(
        new GetObjectCommand({
          Bucket: getEnvConfig().s3_bucket_name,
          Key: key,
          // One byte past the limit tells the caller "too large" without
          // reading the rest of an arbitrarily big object.
          Range: `bytes=0-${max_bytes}`,
        }),
      );
      return response.Body ? await response.Body.transformToByteArray() : null;
    } catch (error) {
      if (isMissing(error)) {
        return null;
      }
      throw storageFailure('storage.object_failed', error);
    }
  }

  async putObject(key: string, bytes: Uint8Array, content_type: string): Promise<void> {
    try {
      await getS3Client().send(
        new PutObjectCommand({
          Bucket: getEnvConfig().s3_bucket_name,
          Key: key,
          Body: bytes,
          ContentType: content_type,
        }),
      );
    } catch (error) {
      throw storageFailure('storage.object_failed', error);
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      // S3 delete of a missing key succeeds, which gives the idempotence the port promises.
      await getS3Client().send(
        new DeleteObjectCommand({ Bucket: getEnvConfig().s3_bucket_name, Key: key }),
      );
    } catch (error) {
      throw storageFailure('storage.object_failed', error);
    }
  }
}
