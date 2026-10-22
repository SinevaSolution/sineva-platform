import type { NextRequest } from 'next/server';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getCancelWorkflowRunUseCase } from '@/server/container';
import { toWorkflowRunView } from '@/server/http/workflow_view';

export const POST = withAuth<{ workspace_id: string; run_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const run = await getCancelWorkflowRunUseCase().execute(params?.run_id ?? '', requestContext);
      return sendSuccessJson({
        data: toWorkflowRunView(run, ''),
        message: 'Workflow run cancelled.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workflow.run' },
);
