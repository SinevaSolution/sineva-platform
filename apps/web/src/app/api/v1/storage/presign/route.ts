import type { NextRequest } from 'next/server';
import { presignStorageDtoSchema } from '@/server/application/dtos/chat_dto';
import { getPresignStorageUploadUseCase } from '@/server/container';
import {
  extractRequestId,
  handleRouteError,
  parseJsonBody,
  sendSuccessJson,
} from '@/server/http/response_helper';

export async function POST(request: NextRequest) {
  try {
    const requestId = extractRequestId(request);
    const rawBody = await parseJsonBody(request);
    const validated = presignStorageDtoSchema.parse(rawBody);
    const result = await getPresignStorageUploadUseCase().execute(validated);

    return sendSuccessJson({
      data: result,
      message: 'SeaweedFS S3 presigned upload URL generated successfully',
      status: 201,
      request_id: requestId,
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
