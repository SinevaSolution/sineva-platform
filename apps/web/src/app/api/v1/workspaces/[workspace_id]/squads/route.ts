import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getCreateSquadUseCase, getListSquadsUseCase } from '@/server/container';
import { CreateSquadSchema, ListSquadsQuerySchema } from '@/server/application/dtos/squad_dto';
import { toSquadView } from '@/server/http/squad_view';

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const query = ListSquadsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
      const result = await getListSquadsUseCase().execute(query, requestContext);
      return sendSuccessJson({
        data: { items: result.items.map(toSquadView) },
        message: 'Squads retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'squad.read' },
);

export const POST = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const dto = CreateSquadSchema.parse(await parseJsonBody(request));
      const squad = await getCreateSquadUseCase().execute(dto, requestContext);
      return sendSuccessJson({
        data: toSquadView(squad),
        message: 'Squad created.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'squad.create' },
);
