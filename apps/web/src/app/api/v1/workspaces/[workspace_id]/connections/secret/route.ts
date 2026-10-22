import type { NextRequest } from 'next/server';
import { saveSecretBodySchema } from '@/server/application/dtos/connection_dto';
import { getSaveApiKeyConnectionUseCase } from '@/server/container';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { assertSessionOnly } from '@/server/http/session_only_guard';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The key arrives in this body and nowhere else, goes into the vault and is never
// echoed. The gate is the workspace permission: pasted-key providers are shared,
// so only Owner and Admin connect them (and replace their keys).
export const POST = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      assertSessionOnly(request);
      const body = saveSecretBodySchema.parse(await parseJsonBody(request));
      const result = await getSaveApiKeyConnectionUseCase().execute({ context: requestContext, ...body });
      return sendSuccessJson({
        data: { connection: result.connection },
        message: result.created ? 'Connected.' : 'Key replaced.',
        request_id: requestContext.request_id,
        status: result.created ? 201 : 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'connection.connect_workspace' },
);
