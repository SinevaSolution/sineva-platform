import type { NextRequest } from 'next/server';
import { handleRouteError, searchParamsToObject, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getListWorkflowTemplatesUseCase } from '@/server/container';
import { ListWorkflowTemplatesQuerySchema } from '@/server/application/dtos/workflow_dto';

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const query = ListWorkflowTemplatesQuerySchema.parse(searchParamsToObject(request));
      const items = await getListWorkflowTemplatesUseCase().execute(query.locale, requestContext);
      return sendSuccessJson({
        data: { items },
        message: 'Workflow templates retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workflow.read' },
);
