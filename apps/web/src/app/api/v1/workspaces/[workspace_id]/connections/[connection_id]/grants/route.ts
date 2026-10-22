import type { NextRequest } from 'next/server';
import { grantsBodySchema } from '@/server/application/dtos/connection_dto';
import { getUpdateConnectionGrantsUseCase } from '@/server/container';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { requireUuid } from '@/server/http/path_ids';
import { assertSessionOnly } from '@/server/http/session_only_guard';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = withAuth<{ workspace_id: string; connection_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      assertSessionOnly(request);
      const body = grantsBodySchema.parse(await parseJsonBody(request));
      const data = await getUpdateConnectionGrantsUseCase().execute({
        context: requestContext,
        connection_id: requireUuid(params?.connection_id, 'Connection'),
        grants: body.grants,
      });
      return sendSuccessJson({ data, message: 'Access updated.', request_id: requestContext.request_id, status: 200 });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'connection.grant' },
);
