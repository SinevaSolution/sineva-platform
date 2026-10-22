import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getUseWorkflowTemplateUseCase } from '@/server/container';
import { UseWorkflowTemplateSchema } from '@/server/application/dtos/workflow_dto';
import { toWorkflowView } from '@/server/http/workflow_view';

// Always an editable draft, never a published Workflow.
export const POST = withAuth<{ workspace_id: string; slug: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const dto = UseWorkflowTemplateSchema.parse(await parseJsonBody(request));
      const workflow = await getUseWorkflowTemplateUseCase().execute(params?.slug ?? '', dto, requestContext);
      return sendSuccessJson({
        data: toWorkflowView({ workflow, last_run: null, attention: null }),
        message: 'Workflow created from a template.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workflow.create' },
);
