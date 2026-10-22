import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getListSquadTemplatesUseCase } from '@/server/container';
import { getLocale } from '@/i18n/server';
import { toSquadTemplateView } from '@/server/http/squad_view';

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const result = getListSquadTemplatesUseCase().execute(await getLocale());
      return sendSuccessJson({
        data: { items: result.items.map(toSquadTemplateView) },
        message: 'Squad templates retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'squad.read' },
);
