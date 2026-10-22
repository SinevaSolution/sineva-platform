import type { NextRequest } from 'next/server';
import { activityQuerySchema } from '@/server/application/dtos/connection_dto';
import { getListConnectionActivityUseCase } from '@/server/container';
import { handleRouteError, searchParamsToObject, sendSuccessJson } from '@/server/http/response_helper';
import { requireUuid } from '@/server/http/path_ids';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ workspace_id: string; connection_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const query = activityQuerySchema.parse(searchParamsToObject(request));
      const data = await getListConnectionActivityUseCase().execute({
        context: requestContext,
        connection_id: requireUuid(params?.connection_id, 'Connection'),
        ...query,
      });
      return sendSuccessJson({ data, message: 'Activity listed.', request_id: requestContext.request_id, status: 200 });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'connection.view_activity' },
);
