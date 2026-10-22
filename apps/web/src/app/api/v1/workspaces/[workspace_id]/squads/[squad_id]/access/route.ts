import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getSetSquadAccessUseCase } from '@/server/container';
import { SetSquadAccessSchema } from '@/server/application/dtos/squad_dto';

export const PUT = withAuth<{ workspace_id: string; squad_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const dto = SetSquadAccessSchema.parse(await parseJsonBody(request));
      const result = await getSetSquadAccessUseCase().execute(params?.squad_id ?? '', dto, requestContext);
      return sendSuccessJson({
        data: result,
        message: 'Squad access updated.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'squad.access.override' },
);
