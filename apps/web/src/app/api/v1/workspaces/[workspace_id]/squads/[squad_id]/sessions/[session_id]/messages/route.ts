import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getCreateSquadMessageUseCase } from '@/server/container';
import { CreateSquadMessageSchema } from '@/server/application/dtos/squad_dto';

export const POST = withAuth<{ workspace_id: string; squad_id: string; session_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const dto = CreateSquadMessageSchema.parse(await parseJsonBody(request));
      const result = await getCreateSquadMessageUseCase().execute(
        params?.squad_id ?? '',
        params?.session_id ?? '',
        dto,
        requestContext,
      );
      return sendSuccessJson({
        data: result,
        message: 'Message stored. Open the run stream to read the reply.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'squad.chat' },
);
