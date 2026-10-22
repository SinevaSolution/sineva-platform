import type { NextRequest } from 'next/server';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getCompleteLibraryUploadUseCase } from '@/server/container';
import { toLibraryDocumentView } from '@/server/http/library_view';

// Step 2 of an upload. No body: the declared size, hash and type were fixed at
// presign, and the platform checks the stored object against them.
export const POST = withAuth<{ workspace_id: string; document_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const document = await getCompleteLibraryUploadUseCase().execute(params?.document_id ?? '', requestContext);
      return sendSuccessJson({
        data: toLibraryDocumentView(document),
        message: 'Upload completed.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'library.upload' },
);
