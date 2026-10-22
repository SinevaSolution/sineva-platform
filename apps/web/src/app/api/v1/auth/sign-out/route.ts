import type { NextRequest } from 'next/server';
import { getJwtAuthService } from '@/server/container';
import {
  extractRequestId,
  handleRouteError,
  sendSuccessJson,
} from '@/server/http/response_helper';
import { clearSessionCookie, getSessionToken } from '@/server/http/auth_cookie_helper';
import { verifyCsrf } from '@/server/http/csrf_guard';
import { withAuth } from '@/server/http/with_auth';

export const POST = withAuth(
  async (request: NextRequest) => {
    const requestId = extractRequestId(request);

    try {
      verifyCsrf(request);
      const token = getSessionToken(request);

      if (token) {
        const authService = getJwtAuthService();
        await authService.signOut(token);
      }

      const response = sendSuccessJson(
        {
          data: { success: true },
          message: 'Signed out successfully.',
          request_id: requestId,
          status: 200,
        },
        { status: 200 },
      );

      clearSessionCookie(response);
      return response;
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'public',
  },
);
