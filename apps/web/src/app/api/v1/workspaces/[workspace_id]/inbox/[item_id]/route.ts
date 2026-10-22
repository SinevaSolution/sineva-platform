import type { NextRequest } from 'next/server';
import { getGetInboxItemUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ workspace_id: string; item_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const result = await getGetInboxItemUseCase().execute(params?.item_id ?? '', requestContext);
      return sendSuccessJson({
        data: result,
        message: 'Inbox item retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'workspace',
    permission: 'inbox.view',
  },
);
