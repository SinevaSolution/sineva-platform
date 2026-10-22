import type { NextRequest } from 'next/server';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getListWorkflowVersionsUseCase } from '@/server/container';
import { toWorkflowVersionView } from '@/server/http/workflow_view';

export const GET = withAuth<{ workspace_id: string; workflow_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const versions = await getListWorkflowVersionsUseCase().execute(params?.workflow_id ?? '', requestContext);
      return sendSuccessJson({
        data: { items: versions.map(toWorkflowVersionView) },
        message: 'Workflow versions retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workflow.read' },
);
