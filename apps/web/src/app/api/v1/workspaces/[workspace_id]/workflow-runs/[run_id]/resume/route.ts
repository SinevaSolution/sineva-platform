import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getResumeWorkflowRunUseCase } from '@/server/container';
import { ResumeWorkflowRunSchema } from '@/server/application/dtos/workflow_dto';
import { toWorkflowRunView } from '@/server/http/workflow_view';

export const POST = withAuth<{ workspace_id: string; run_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const dto = ResumeWorkflowRunSchema.parse(await parseJsonBody(request));
      const run = await getResumeWorkflowRunUseCase().execute(params?.run_id ?? '', dto, requestContext);
      return sendSuccessJson({
        data: toWorkflowRunView(run, ''),
        message: 'Workflow run resumed.',
        request_id: requestContext.request_id,
        status: 202,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workflow.run' },
);
