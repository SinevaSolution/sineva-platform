import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getListSquadActivityUseCase } from '@/server/container';
import { SquadActivityQuerySchema } from '@/server/application/dtos/squad_dto';
import { toSquadTurnView } from '@/server/http/squad_view';

export const GET = withAuth<{ workspace_id: string; squad_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const query = SquadActivityQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
      const result = await getListSquadActivityUseCase().execute(params?.squad_id ?? '', query, requestContext);
      return sendSuccessJson({
        data: { items: result.items.map(toSquadTurnView) },
        message: 'Squad activity retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'squad.read' },
);
