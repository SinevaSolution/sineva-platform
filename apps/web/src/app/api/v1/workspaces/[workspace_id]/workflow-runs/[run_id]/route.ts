import type { NextRequest } from 'next/server';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getGetWorkflowRunUseCase } from '@/server/container';
import { toWorkflowRunDetailView } from '@/server/http/workflow_view';

// The screen polls this while a run is active. It reads the engine first, so
// the answer is never a stale "running" for a run that ended.
export const GET = withAuth<{ workspace_id: string; run_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const detail = await getGetWorkflowRunUseCase().execute(params?.run_id ?? '', requestContext);
      return sendSuccessJson({
        data: toWorkflowRunDetailView(detail),
        message: 'Workflow run retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workflow.read' },
);
