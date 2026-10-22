import type { NextRequest } from 'next/server';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getGetLibrarySummaryUseCase } from '@/server/container';

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const summary = await getGetLibrarySummaryUseCase().execute(requestContext);
      return sendSuccessJson({
        data: summary,
        message: 'Library summary retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'library.read' },
);
