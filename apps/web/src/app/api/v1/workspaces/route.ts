import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { LocaleSchema } from '@/server/application/dtos/locale_dto';
import {
  getCreateWorkspaceUseCase,
  getListUserWorkspacesUseCase,
} from '@/server/container';
import {
  handleRouteError,
  parseJsonBody,
  sendSuccessJson,
} from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

const CreateWorkspaceSchema = z.object({
  workspace_name: z.string().min(1, 'Workspace name is required').max(100),
  workspace_slug: z.string().min(2).max(48).optional(),
  default_locale: LocaleSchema.optional(),
  timezone: z.string().optional(),
  logo_url: z.string().url().nullable().optional(),
});

export const GET = withAuth(
  async (request: NextRequest, { requestContext }) => {
    try {
      const useCase = getListUserWorkspacesUseCase();
      const workspaces = await useCase.execute({
        user_id: requestContext.user_id,
      });

      return sendSuccessJson({
        data: workspaces,
        message: 'Workspaces retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'user',
  },
);

export const POST = withAuth(
  async (request: NextRequest, { requestContext }) => {
    try {
      const body = await parseJsonBody(request);
      const validated = CreateWorkspaceSchema.parse(body);

      const useCase = getCreateWorkspaceUseCase();
      const workspace = await useCase.execute({
        workspace_name: validated.workspace_name,
        workspace_slug: validated.workspace_slug,
        owner_user_id: requestContext.user_id,
        default_locale: validated.default_locale,
        timezone: validated.timezone,
        logo_url: validated.logo_url,
        context: requestContext,
      });

      return sendSuccessJson(
        {
          data: workspace,
          message: 'Workspace created successfully.',
          request_id: requestContext.request_id,
          status: 201,
        },
        { status: 201 },
      );
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'user',
  },
);
