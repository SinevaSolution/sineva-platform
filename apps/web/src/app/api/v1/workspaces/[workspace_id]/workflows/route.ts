import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, searchParamsToObject, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getCreateWorkflowUseCase, getListWorkflowsUseCase } from '@/server/container';
import { CreateWorkflowSchema, ListWorkflowsQuerySchema } from '@/server/application/dtos/workflow_dto';
import { toWorkflowView } from '@/server/http/workflow_view';

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const query = ListWorkflowsQuerySchema.parse(searchParamsToObject(request));
      const result = await getListWorkflowsUseCase().execute(query, requestContext);
      return sendSuccessJson({
        data: {
          items: result.items.map(toWorkflowView),
          total: result.total,
          page: result.page,
          per_page: result.per_page,
        },
        message: 'Workflows retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workflow.read' },
);

export const POST = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const dto = CreateWorkflowSchema.parse(await parseJsonBody(request));
      const workflow = await getCreateWorkflowUseCase().execute(dto, requestContext);
      return sendSuccessJson({
        data: toWorkflowView({ workflow, last_run: null, attention: null }),
        message: 'Workflow created.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workflow.create' },
);
