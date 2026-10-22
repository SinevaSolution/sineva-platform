import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import {
  getDeleteWorkflowUseCase,
  getGetWorkflowUseCase,
  getUpdateWorkflowDraftUseCase,
} from '@/server/container';
import { UpdateWorkflowSchema } from '@/server/application/dtos/workflow_dto';
import { toWorkflowDetailView } from '@/server/http/workflow_view';

type Params = { workspace_id: string; workflow_id: string };

export const GET = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const detail = await getGetWorkflowUseCase().execute(params?.workflow_id ?? '', requestContext);
      return sendSuccessJson({
        data: toWorkflowDetailView(detail),
        message: 'Workflow retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workflow.read' },
);

// Members edit only drafts they created; the use case checks the creator, the
// guard only keeps viewers out.
export const PATCH = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const dto = UpdateWorkflowSchema.parse(await parseJsonBody(request));
      const workflow = await getUpdateWorkflowDraftUseCase().execute(params?.workflow_id ?? '', dto, requestContext);
      return sendSuccessJson({
        data: { id: workflow.id, name: workflow.name, description: workflow.description, draft_revision: workflow.draft_revision, updated_at: workflow.updated_at },
        message: 'Workflow draft saved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workflow.edit' },
);

export const DELETE = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const result = await getDeleteWorkflowUseCase().execute(params?.workflow_id ?? '', requestContext);
      return sendSuccessJson({
        data: result,
        message: 'Workflow deleted.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workflow.delete' },
);
