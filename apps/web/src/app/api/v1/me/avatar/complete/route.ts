import type { NextRequest } from 'next/server';
import { CompleteAvatarUploadSchema } from '@/server/application/dtos/avatar_dto';
import { getCompleteAvatarUploadUseCase } from '@/server/container';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// Step 2 of the upload: the browser has PUT the file to the presigned URL;
// the server now reads it, checks the bytes, re-encodes and switches the avatar.
export const POST = withAuth(
  async (request: NextRequest, { requestContext }) => {
    try {
      const body = CompleteAvatarUploadSchema.parse(await parseJsonBody(request));
      const profile = await getCompleteAvatarUploadUseCase().execute({
        user_id: requestContext.user_id,
        upload_id: body.upload_id,
        context: requestContext,
      });
      return sendSuccessJson({
        data: profile,
        message: 'Avatar updated successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  { scope: 'user', permission: 'profile.update' },
);
