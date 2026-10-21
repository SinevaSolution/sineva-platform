import type {
  PresignUploadRequest,
  PresignUploadResult,
  StorageRepository,
} from '@/server/domain/repositories/storage_repository';

export class FakeStorage implements StorageRepository {
  public readonly requests: PresignUploadRequest[] = [];

  async createPresignedUploadUrl(
    request: PresignUploadRequest,
  ): Promise<PresignUploadResult> {
    this.requests.push(request);
    const object_key = `workspaces/${request.workspace_id}/fake_${request.file_name}`;
    return {
      object_key,
      upload_url: `https://fake-storage.test/fake-bucket/${object_key}`,
      bucket_name: 'fake-bucket',
      expires_in_seconds: 900,
      storage_provider: 'seaweedfs_s3',
    };
  }

  async checkHealth(): Promise<boolean> {
    return true;
  }
}
