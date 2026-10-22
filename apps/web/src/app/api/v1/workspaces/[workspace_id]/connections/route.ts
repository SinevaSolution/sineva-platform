import type { NextRequest } from 'next/server';
import { listConnectionsQuerySchema } from '@/server/application/dtos/connection_dto';
import { getListConnectionsUseCase } from '@/server/container';
import { handleRouteError, searchParamsToObject, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Another member's personal connection is never in this list, for any role: the
// repository query carries the rule, so there is nothing for the route to filter.
export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const query = listConnectionsQuerySchema.parse(searchParamsToObject(request));
      const data = await getListConnectionsUseCase().execute({ context: requestContext, ...query });
      return sendSuccessJson({ data, message: 'Connections listed.', request_id: requestContext.request_id, status: 200 });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'connection.view' },
);
