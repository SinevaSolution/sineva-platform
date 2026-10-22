import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getRestoreWorkflowVersionUseCase } from '@/server/container';
import { RestoreWorkflowSchema } from '@/server/application/dtos/workflow_dto';
import { toWorkflowVersionView, toWorkflowView } from '@/server/http/workflow_view';

export const POST = withAuth<{ workspace_id: string; workflow_id: string; version_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const dto = RestoreWorkflowSchema.parse(await parseJsonBody(request));
      const { workflow, version } = await getRestoreWorkflowVersionUseCase().execute(
        params?.workflow_id ?? '',
        params?.version_id ?? '',
        dto,
        requestContext,
      );
      return sendSuccessJson({
        data: {
          workflow: toWorkflowView({ workflow, last_run: null, attention: [] }),
          version: toWorkflowVersionView(version),
        },
        message: 'Workflow version restored.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workflow.publish' },
);
