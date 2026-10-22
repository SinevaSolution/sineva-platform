import type { NextRequest } from 'next/server';
import { getListInboxUseCase } from '@/server/container';
import { ListInboxQuerySchema } from '@/server/application/dtos/inbox_dto';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const query = ListInboxQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
      const result = await getListInboxUseCase().execute(
        {
          ...(query.tab ? { tab: query.tab } : {}),
          ...(query.agent_slug ? { agent_slug: query.agent_slug } : {}),
          ...(query.kind ? { kind: query.kind } : {}),
          ...(query.source_type ? { source_type: query.source_type } : {}),
          ...(query.q ? { q: query.q } : {}),
          ...(query.cursor ? { cursor: query.cursor } : {}),
          limit: query.limit,
        },
        requestContext,
      );
      return sendSuccessJson({
        data: result,
        message: 'Inbox retrieved successfully.',
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
