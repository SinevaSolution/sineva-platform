import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getStartWorkflowRunUseCase } from '@/server/container';
import { StartWorkflowRunSchema } from '@/server/application/dtos/workflow_dto';
import { toWorkflowRunView } from '@/server/http/workflow_view';

// Starts a test run of the draft or a live run of the published version. A 503
// `workflow_engine_unavailable` means nothing ran: the screen says so and no
// run exists to show.
export const POST = withAuth<{ workspace_id: string; workflow_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const dto = StartWorkflowRunSchema.parse(await parseJsonBody(request));
      const run = await getStartWorkflowRunUseCase().execute(params?.workflow_id ?? '', dto, requestContext);
      return sendSuccessJson({
        data: toWorkflowRunView(run, ''),
        message: 'Workflow run started.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workflow.run' },
);
