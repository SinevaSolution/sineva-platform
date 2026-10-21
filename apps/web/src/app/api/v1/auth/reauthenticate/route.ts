import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getJwtAuthService } from '@/server/container';
import {
  extractRequestId,
  handleRouteError,
  parseJsonBody,
  sendSuccessJson,
} from '@/server/http/response_helper';
import { setSessionCookie } from '@/server/http/auth_cookie_helper';
import { withAuth } from '@/server/http/with_auth';

const ReauthenticateSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export const POST = withAuth(
  async (request: NextRequest, { requestContext }) => {
    const requestId = extractRequestId(request);

    try {
      const body = await parseJsonBody(request);
      const validated = ReauthenticateSchema.parse(body);

      const authService = getJwtAuthService();
      const result = await authService.reauthenticate(
        requestContext.user_id,
        validated.password,
        requestContext.session_id,
      );

      const response = sendSuccessJson(
        {
          data: {
            fresh_until: result.fresh_until,
          },
          message: 'Re-authentication successful.',
          request_id: requestId,
          status: 200,
        },
        { status: 200 },
      );

      // Update session cookie with refreshed token
      setSessionCookie(response, result.refreshed_token);

      return response;
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'user',
  },
);
