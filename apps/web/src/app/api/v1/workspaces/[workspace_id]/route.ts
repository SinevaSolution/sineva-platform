import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getGetWorkspaceUseCase,
  getUpdateWorkspaceUseCase,
} from '@/server/container';
import {
  handleRouteError,
  parseJsonBody,
  sendSuccessJson,
} from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

const UpdateWorkspaceSchema = z.object({
  workspace_name: z.string().min(1).max(100).optional(),
  workspace_slug: z.string().min(2).max(48).optional(),
  logo_url: z.string().url().nullable().optional(),
  default_locale: z.string().optional(),
  timezone: z.string().optional(),
});

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const workspaceId = params?.workspace_id ?? requestContext.workspace_id ?? '';
      const useCase = getGetWorkspaceUseCase();
      const workspace = await useCase.execute({ workspace_id: workspaceId });

      return sendSuccessJson({
        data: workspace,
        message: 'Workspace retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'workspace',
    permission: 'workspace.view',
  },
);

export const PATCH = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const workspaceId = params?.workspace_id ?? requestContext.workspace_id ?? '';
      const body = await parseJsonBody(request);
      const validated = UpdateWorkspaceSchema.parse(body);

      const useCase = getUpdateWorkspaceUseCase();
      const workspace = await useCase.execute({
        workspace_id: workspaceId,
        workspace_name: validated.workspace_name,
        workspace_slug: validated.workspace_slug,
        logo_url: validated.logo_url,
        default_locale: validated.default_locale,
        timezone: validated.timezone,
        context: requestContext,
      });

      return sendSuccessJson({
        data: workspace,
        message: 'Workspace updated successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'workspace',
    permission: 'workspace.update',
  },
);
