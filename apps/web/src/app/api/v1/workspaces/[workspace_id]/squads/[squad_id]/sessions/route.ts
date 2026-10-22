import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getCreateSquadSessionUseCase, getListSquadSessionsUseCase } from '@/server/container';
import { CreateSquadSessionSchema } from '@/server/application/dtos/squad_dto';

type Params = { workspace_id: string; squad_id: string };

export const GET = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const result = await getListSquadSessionsUseCase().execute(params?.squad_id ?? '', requestContext);
      return sendSuccessJson({
        data: result,
        message: 'Squad sessions retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'squad.read' },
);

export const POST = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const raw = request.headers.get('content-length') === '0' ? {} : await parseJsonBody(request);
      const dto = CreateSquadSessionSchema.parse(raw ?? {});
      const session = await getCreateSquadSessionUseCase().execute(params?.squad_id ?? '', dto, requestContext);
      return sendSuccessJson({
        data: session,
        message: 'Squad session created.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'squad.chat' },
);
