import type { NextRequest } from 'next/server';
import { getGetBusinessProfileUseCase, getSaveBusinessProfileUseCase } from '@/server/container';
import { SaveProfileSchema } from '@/server/application/dtos/business_profile_dto';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const result = await getGetBusinessProfileUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
      });
      return sendSuccessJson({
        data: result,
        message: 'Business profile retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'business_profile.view' },
);

// Keys left out stay as they are, `null` clears a field. The body is strict:
// `user_id`, `workspace_id` and any unknown key are a 422, not silently dropped.
export const PUT = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const input = SaveProfileSchema.parse(await parseJsonBody(request));
      const result = await getSaveBusinessProfileUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        user_id: requestContext.user_id,
        input,
        context: requestContext,
      });
      return sendSuccessJson({
        data: result,
        message: 'Business profile saved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'business_profile.update' },
);
