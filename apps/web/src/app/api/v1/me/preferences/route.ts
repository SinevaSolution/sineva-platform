import type { NextRequest } from 'next/server';
import { UpdatePreferencesSchema } from '@/server/application/dtos/preferences_dto';
import { getGetPreferencesUseCase, getUpdatePreferencesUseCase } from '@/server/container';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const GET = withAuth(
  async (request: NextRequest, { requestContext }) => {
    try {
      const preferences = await getGetPreferencesUseCase().execute(requestContext.user_id);
      return sendSuccessJson({
        data: preferences,
        message: 'Preferences retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  { scope: 'user', permission: 'preferences.manage_own' },
);

export const PATCH = withAuth(
  async (request: NextRequest, { requestContext }) => {
    try {
      const body = UpdatePreferencesSchema.parse(await parseJsonBody(request));
      const preferences = await getUpdatePreferencesUseCase().execute({
        user_id: requestContext.user_id,
        ...body,
        context: requestContext,
      });
      return sendSuccessJson({
        data: preferences,
        message: 'Preferences updated successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  { scope: 'user', permission: 'preferences.manage_own' },
);
