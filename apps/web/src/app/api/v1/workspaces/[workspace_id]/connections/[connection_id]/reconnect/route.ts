import type { NextRequest } from 'next/server';
import { reconnectBodySchema } from '@/server/application/dtos/connection_dto';
import { getReconnectConnectionUseCase } from '@/server/container';
import { handleRouteError, parseOptionalJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { requireUuid } from '@/server/http/path_ids';
import { assertSessionOnly } from '@/server/http/session_only_guard';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<{ workspace_id: string; connection_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      assertSessionOnly(request);
      const body = reconnectBodySchema.parse(await parseOptionalJsonBody(request));
      const result = await getReconnectConnectionUseCase().execute({
        context: requestContext,
        connection_id: requireUuid(params?.connection_id, 'Connection'),
        ...body,
      });
      return sendSuccessJson({
        data: {
          flow_id: result.flow_id,
          authorization_url: result.authorization_url,
          expires_at: result.expires_at.toISOString(),
        },
        message: 'Reconnect flow started.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'connection.disconnect' },
);
