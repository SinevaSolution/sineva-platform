import type {
  PresignUploadResult,
  StorageRepository,
} from '@/server/domain/repositories/storage_repository';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ValidationError } from '@/server/domain/errors/domain_error';

export interface PresignUploadInput {
  file_name: string;
  content_type: string;
  file_size_bytes: number;
  workspace_id?: string;
}

export class PresignStorageUploadUseCase {
  constructor(private readonly storageRepository: StorageRepository) {}

  async execute(
    input: PresignUploadInput,
    context?: RequestContext,
  ): Promise<PresignUploadResult> {
    const workspaceId = context?.workspace_id ?? input.workspace_id;
    if (!workspaceId) {
      throw new ValidationError('Workspace context is required for storage upload', [
        {
          code: 'workspace_required',
          field: 'workspace_id',
          detail: 'workspace_id is required',
        },
      ]);
    }

    return this.storageRepository.createPresignedUploadUrl({
      workspace_id: workspaceId,
      file_name: input.file_name,
      content_type: input.content_type,
      file_size_bytes: input.file_size_bytes,
    });
  }
}
