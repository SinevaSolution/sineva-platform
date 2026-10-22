import type { NextRequest } from 'next/server';
import { UpdateProfileSchema } from '@/server/application/dtos/profile_dto';
import { getGetProfileUseCase, getUpdateProfileUseCase } from '@/server/container';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// Identity is the session user (`requestContext.user_id`); the body can only
// carry the editable fields. `withAuth` runs `verifyCsrf` for cookie-auth PATCH.
export const GET = withAuth(
  async (request: NextRequest, { requestContext }) => {
    try {
      const profile = await getGetProfileUseCase().execute(requestContext.user_id);

      return sendSuccessJson({
        data: profile,
        message: 'Profile retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  { scope: 'user' },
);

export const PATCH = withAuth(
  async (request: NextRequest, { requestContext }) => {
    try {
      const body = UpdateProfileSchema.parse(await parseJsonBody(request));
      const profile = await getUpdateProfileUseCase().execute({
        user_id: requestContext.user_id,
        ...body,
        context: requestContext,
      });

      return sendSuccessJson({
        data: profile,
        message: 'Profile updated successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  { scope: 'user' },
);
