import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import {
  getDeleteSquadUseCase,
  getGetSquadUseCase,
  getUpdateSquadUseCase,
} from '@/server/container';
import { UpdateSquadSchema } from '@/server/application/dtos/squad_dto';
import { toSquadView } from '@/server/http/squad_view';

type Params = { workspace_id: string; squad_id: string };

export const GET = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const squad = await getGetSquadUseCase().execute(params?.squad_id ?? '', requestContext);
      return sendSuccessJson({
        data: toSquadView(squad),
        message: 'Squad retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'squad.read' },
);

export const PATCH = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const dto = UpdateSquadSchema.parse(await parseJsonBody(request));
      const squad = await getUpdateSquadUseCase().execute(params?.squad_id ?? '', dto, requestContext);
      return sendSuccessJson({
        data: toSquadView(squad),
        message: 'Squad updated.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'squad.edit' },
);

export const DELETE = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const result = await getDeleteSquadUseCase().execute(params?.squad_id ?? '', requestContext);
      return sendSuccessJson({
        data: result,
        message: 'Squad deleted.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'squad.delete' },
);
