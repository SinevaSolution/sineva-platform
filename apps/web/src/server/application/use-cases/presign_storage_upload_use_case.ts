import type {
  PresignUploadRequest,
  PresignUploadResult,
  StorageRepository,
} from '@/server/domain/repositories/storage_repository';

export class PresignStorageUploadUseCase {
  constructor(private readonly storageRepository: StorageRepository) {}

  async execute(request: PresignUploadRequest): Promise<PresignUploadResult> {
    return this.storageRepository.createPresignedUploadUrl(request);
  }
}
