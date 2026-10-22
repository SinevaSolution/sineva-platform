import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getSetSquadMembersUseCase } from '@/server/container';
import { SetSquadMembersSchema } from '@/server/application/dtos/squad_dto';
import { toSquadView } from '@/server/http/squad_view';

export const PUT = withAuth<{ workspace_id: string; squad_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const dto = SetSquadMembersSchema.parse(await parseJsonBody(request));
      const squad = await getSetSquadMembersUseCase().execute(params?.squad_id ?? '', dto, requestContext);
      return sendSuccessJson({
        data: toSquadView(squad),
        message: 'Squad members updated.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'squad.edit' },
);
