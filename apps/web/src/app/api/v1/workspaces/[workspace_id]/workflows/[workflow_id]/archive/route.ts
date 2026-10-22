import type { NextRequest } from 'next/server';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getArchiveWorkflowUseCase } from '@/server/container';
import { toWorkflowView } from '@/server/http/workflow_view';

export const POST = withAuth<{ workspace_id: string; workflow_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const workflow = await getArchiveWorkflowUseCase().execute(params?.workflow_id ?? '', requestContext);
      return sendSuccessJson({
        data: toWorkflowView({ workflow, last_run: null, attention: [] }),
        message: 'Workflow archived.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workflow.delete' },
);
