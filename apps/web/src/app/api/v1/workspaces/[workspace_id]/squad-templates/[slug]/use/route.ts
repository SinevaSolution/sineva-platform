import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getUseSquadTemplateUseCase } from '@/server/container';
import { getLocale } from '@/i18n/server';
import { UseSquadTemplateSchema } from '@/server/application/dtos/squad_dto';
import { toSquadView } from '@/server/http/squad_view';

export const POST = withAuth<{ workspace_id: string; slug: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      // The body is optional: a template can be used as it is.
      const raw = request.headers.get('content-length') === '0' ? {} : await parseJsonBody(request);
      const dto = UseSquadTemplateSchema.parse(raw ?? {});
      const squad = await getUseSquadTemplateUseCase().execute(params?.slug ?? '', dto, await getLocale(), requestContext);
      return sendSuccessJson({
        data: toSquadView(squad),
        message: 'Squad created from template.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'squad.create' },
);
