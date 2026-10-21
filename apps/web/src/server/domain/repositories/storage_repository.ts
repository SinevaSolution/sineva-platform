export interface PresignUploadRequest {
  workspace_id: string;
  file_name: string;
  content_type: string;
  file_size_bytes: number;
}

export interface PresignUploadResult {
  object_key: string;
  upload_url: string;
  bucket_name: string;
  expires_in_seconds: number;
  storage_provider: 'seaweedfs_s3';
}

export interface StorageRepository {
  createPresignedUploadUrl(
    request: PresignUploadRequest,
  ): Promise<PresignUploadResult>;
  checkHealth(): Promise<boolean>;
}
