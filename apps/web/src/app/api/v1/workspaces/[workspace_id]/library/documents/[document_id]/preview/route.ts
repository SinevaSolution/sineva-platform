import type { NextRequest } from 'next/server';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getPreviewLibraryDocumentUseCase } from '@/server/container';
import { PreviewLibraryDocumentQuerySchema } from '@/server/application/dtos/library_dto';

export const GET = withAuth<{ workspace_id: string; document_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const query = PreviewLibraryDocumentQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
      const preview = await getPreviewLibraryDocumentUseCase().execute(params?.document_id ?? '', query, requestContext);
      return sendSuccessJson({
        data: preview,
        message: 'Library preview retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'library.read' },
);
