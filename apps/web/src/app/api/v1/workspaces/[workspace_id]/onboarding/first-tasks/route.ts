import type { NextRequest } from 'next/server';
import { getGetFirstTasksUseCase } from '@/server/container';
import { FirstTasksQuerySchema } from '@/server/application/dtos/onboarding_dto';
import { handleRouteError, searchParamsToObject, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const query = FirstTasksQuerySchema.parse(searchParamsToObject(request));
      const tasks = await getGetFirstTasksUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        user_id: requestContext.user_id,
        locale: query.locale,
      });
      return sendSuccessJson({
        data: { tasks },
        message: 'First tasks retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workspace.view' },
);
