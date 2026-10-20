import type { NextRequest } from 'next/server';
import { presignStorageDtoSchema } from '@/application/dtos/chat_dto';
import { PresignStorageUploadUseCase } from '@/application/use-cases/presign_storage_upload_use_case';
import { defaultStorageRepository } from '@/infrastructure/storage/seaweed_storage_repository';
import {
  handleRouteError,
  sendSuccessJson,
} from '@/presentation/http/response_helper';

const presignStorageUseCase = new PresignStorageUploadUseCase(
  defaultStorageRepository,
);

export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json();
    const validated = presignStorageDtoSchema.parse(rawBody);
    const result = await presignStorageUseCase.execute(validated);

    return sendSuccessJson({
      data: result,
      message: 'SeaweedFS S3 presigned upload URL generated successfully',
      status: 201,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
