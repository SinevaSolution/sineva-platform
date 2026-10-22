import type { NextRequest } from 'next/server';
import { getTestConnectionUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { requireUuid } from '@/server/http/path_ids';
import { assertSessionOnly } from '@/server/http/session_only_guard';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<{ workspace_id: string; connection_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      assertSessionOnly(request);
      const data = await getTestConnectionUseCase().execute({
        context: requestContext,
        connection_id: requireUuid(params?.connection_id, 'Connection'),
      });
      return sendSuccessJson({ data, message: 'Connection tested.', request_id: requestContext.request_id, status: 200 });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'connection.disconnect' },
);
