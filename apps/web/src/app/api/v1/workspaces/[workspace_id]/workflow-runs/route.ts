import type { NextRequest } from 'next/server';
import { handleRouteError, searchParamsToObject, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getListWorkflowRunsUseCase } from '@/server/container';
import { ListWorkflowRunsQuerySchema } from '@/server/application/dtos/workflow_dto';
import { toWorkflowRunView } from '@/server/http/workflow_view';

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const query = ListWorkflowRunsQuerySchema.parse(searchParamsToObject(request));
      const result = await getListWorkflowRunsUseCase().execute(query, requestContext);
      return sendSuccessJson({
        data: {
          items: result.items.map((item) => toWorkflowRunView(item.run, item.workflow_name)),
          total: result.total,
          page: result.page,
          per_page: result.per_page,
        },
        message: 'Workflow runs retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workflow.read' },
);
