import type { NextRequest } from 'next/server';
import { UpdateProfileSchema } from '@/server/application/dtos/profile_dto';
import { getGetMeUseCase, getUpdateProfileUseCase } from '@/server/container';
import { toMeView } from '@/server/http/me_view';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// The profile resource. Identity is the session user, never the body; the
// body schema is strict, so a read-only field (email, status, ...) is a 422.
export const GET = withAuth(
  async (request: NextRequest, { requestContext }) => {
    try {
      const me = await getGetMeUseCase().execute(requestContext.user_id);
      return sendSuccessJson({
        data: toMeView(me),
        message: 'Profile retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  { scope: 'user', permission: 'profile.view' },
);

export const PATCH = withAuth(
  async (request: NextRequest, { requestContext }) => {
    try {
      const body = UpdateProfileSchema.parse(await parseJsonBody(request));
      await getUpdateProfileUseCase().execute({
        user_id: requestContext.user_id,
        ...body,
        context: requestContext,
      });
      const me = await getGetMeUseCase().execute(requestContext.user_id);
      return sendSuccessJson({
        data: toMeView(me),
        message: 'Profile updated successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  { scope: 'user', permission: 'profile.update' },
);
