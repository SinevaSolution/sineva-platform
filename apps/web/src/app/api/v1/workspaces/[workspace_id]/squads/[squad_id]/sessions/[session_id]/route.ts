import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getGetSquadSessionUseCase } from '@/server/container';
import { toSquadSessionDetailView } from '@/server/http/squad_view';

export const GET = withAuth<{ workspace_id: string; squad_id: string; session_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const detail = await getGetSquadSessionUseCase().execute(params?.squad_id ?? '', params?.session_id ?? '', requestContext);
      return sendSuccessJson({
        data: toSquadSessionDetailView(detail),
        message: 'Squad session retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'squad.read' },
);
