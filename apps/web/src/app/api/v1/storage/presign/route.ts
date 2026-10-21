import type { NextRequest } from 'next/server';
import { presignStorageDtoSchema } from '@/server/application/dtos/chat_dto';
import { getPresignStorageUploadUseCase } from '@/server/container';
import {
  handleRouteError,
  sendSuccessJson,
} from '@/server/http/response_helper';

export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json();
    const validated = presignStorageDtoSchema.parse(rawBody);
    const result = await getPresignStorageUploadUseCase().execute(validated);

    return sendSuccessJson({
      data: result,
      message: 'SeaweedFS S3 presigned upload URL generated successfully',
      status: 201,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
