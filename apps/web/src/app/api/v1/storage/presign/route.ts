import type { NextRequest } from 'next/server';
import { presignStorageDtoSchema } from '@/server/application/dtos/chat_dto';
import { getPresignStorageUploadUseCase } from '@/server/container';
import {
  extractRequestId,
  parseJsonBody,
  sendSuccessJson,
} from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const POST = withAuth(
  async (request: NextRequest, { requestContext }) => {
    const requestId = extractRequestId(request);
    const rawBody = await parseJsonBody(request);
    const validated = presignStorageDtoSchema.parse(rawBody);
    const result = await getPresignStorageUploadUseCase().execute(validated, requestContext);

    return sendSuccessJson({
      data: result,
      message: 'SeaweedFS S3 presigned upload URL generated successfully',
      status: 201,
      request_id: requestId,
    });
  },
  {
    scope: 'workspace',
    permission: 'storage.upload',
  },
);
