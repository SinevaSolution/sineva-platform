import type { NextRequest } from 'next/server';
import { getDismissInboxItemUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { assertSessionOnly } from '@/server/http/session_only_guard';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<{ workspace_id: string; item_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      assertSessionOnly(request);
      const result = await getDismissInboxItemUseCase().execute(params?.item_id ?? '', requestContext);
      return sendSuccessJson({
        data: result,
        message: 'Inbox item dismissed.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'workspace',
    permission: 'inbox.answer',
  },
);
