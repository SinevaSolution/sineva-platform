import type { NextRequest } from 'next/server';
import { getDisconnectConnectionUseCase, getGetConnectionUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { requireUuid } from '@/server/http/path_ids';
import { assertSessionOnly } from '@/server/http/session_only_guard';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { workspace_id: string; connection_id: string };

export const GET = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const data = await getGetConnectionUseCase().execute({
        context: requestContext,
        connection_id: requireUuid(params?.connection_id, 'Connection'),
      });
      return sendSuccessJson({ data, message: 'Connection loaded.', request_id: requestContext.request_id, status: 200 });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'connection.view' },
);

export const DELETE = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      assertSessionOnly(request);
      const data = await getDisconnectConnectionUseCase().execute({
        context: requestContext,
        connection_id: requireUuid(params?.connection_id, 'Connection'),
      });
      return sendSuccessJson({ data, message: 'Disconnected.', request_id: requestContext.request_id, status: 200 });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'connection.disconnect' },
);
