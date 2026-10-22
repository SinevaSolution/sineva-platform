import type { NextRequest } from 'next/server';
import { startOAuthBodySchema } from '@/server/application/dtos/connection_dto';
import { getStartOAuthFlowUseCase } from '@/server/container';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { assertSessionOnly } from '@/server/http/session_only_guard';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The gate is the personal permission (owner, admin, member): it keeps a viewer
// out before the body is read. The use case then asks for the workspace
// permission when the body says `workspace`, so a member cannot create a shared
// connection. Identity and workspace come from the session and the URL only.
export const POST = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      assertSessionOnly(request);
      const body = startOAuthBodySchema.parse(await parseJsonBody(request));
      const result = await getStartOAuthFlowUseCase().execute({ context: requestContext, ...body });
      return sendSuccessJson({
        data: {
          flow_id: result.flow_id,
          authorization_url: result.authorization_url,
          expires_at: result.expires_at.toISOString(),
        },
        message: 'Connection flow started.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'connection.connect_personal' },
);
