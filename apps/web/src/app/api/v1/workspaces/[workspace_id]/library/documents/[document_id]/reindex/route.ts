import type { NextRequest } from 'next/server';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getReindexLibraryDocumentUseCase } from '@/server/container';
import { toLibraryDocumentView } from '@/server/http/library_view';

// 202: the work happens in sineva-ai. A running job is refreshed instead of restarted.
export const POST = withAuth<{ workspace_id: string; document_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const document = await getReindexLibraryDocumentUseCase().execute(params?.document_id ?? '', requestContext);
      return sendSuccessJson({
        data: toLibraryDocumentView(document),
        message: 'Reindex requested.',
        request_id: requestContext.request_id,
        status: 202,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'library.manage' },
);
