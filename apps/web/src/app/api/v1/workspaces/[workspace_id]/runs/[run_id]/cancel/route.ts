import type { NextRequest } from 'next/server';
import { getCancelRunUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<{ workspace_id: string; run_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const result = await getCancelRunUseCase().execute(params?.run_id ?? '', requestContext);
      return sendSuccessJson({
        data: result,
        message: 'Stop requested.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'workspace',
    permission: 'chat.send',
  },
);
