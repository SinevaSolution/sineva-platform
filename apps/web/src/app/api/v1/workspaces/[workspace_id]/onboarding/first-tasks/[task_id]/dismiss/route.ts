import type { NextRequest } from 'next/server';
import { getDismissFirstTaskUseCase } from '@/server/container';
import { TaskIdParamSchema } from '@/server/application/dtos/onboarding_dto';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const POST = withAuth<{ workspace_id: string; task_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const taskId = TaskIdParamSchema.parse(params?.task_id);
      const dismissed = await getDismissFirstTaskUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        user_id: requestContext.user_id,
        role: requestContext.role ?? 'member',
        task_id: taskId,
      });
      return sendSuccessJson({
        data: { dismissed_tasks: dismissed },
        message: 'Task dismissed.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workspace.view' },
);
