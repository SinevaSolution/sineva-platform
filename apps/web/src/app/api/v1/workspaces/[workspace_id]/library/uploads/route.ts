import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getRequestLibraryUploadUseCase } from '@/server/container';
import { RequestLibraryUploadSchema } from '@/server/application/dtos/library_dto';

// Step 1 of an upload: a presigned PUT to SeaweedFS. The browser sends the file
// straight to storage; the platform never buffers it. Step 2 is `complete`.
export const POST = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const dto = RequestLibraryUploadSchema.parse(await parseJsonBody(request));
      const ticket = await getRequestLibraryUploadUseCase().execute(dto, requestContext);
      return sendSuccessJson({
        data: ticket,
        message: 'Upload prepared.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'library.upload' },
);
