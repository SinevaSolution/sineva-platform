import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getJwtAuthService } from '@/server/container';
import {
  extractRequestId,
  handleRouteError,
  parseJsonBody,
  sendSuccessJson,
} from '@/server/http/response_helper';
import { verifyCsrf } from '@/server/http/csrf_guard';
import { withAuth } from '@/server/http/with_auth';

const VerifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export const POST = withAuth(
  async (request: NextRequest) => {
    const requestId = extractRequestId(request);

    try {
      verifyCsrf(request);
      const body = await parseJsonBody(request);
      const validated = VerifyEmailSchema.parse(body);

      const authService = getJwtAuthService();
      const result = await authService.verifyEmail({
        token: validated.token,
      });

      return sendSuccessJson(
        {
          data: result,
          message: 'Email verified successfully.',
          request_id: requestId,
          status: 200,
        },
        { status: 200 },
      );
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'public',
  },
);

export const GET = withAuth(
  async (request: NextRequest) => {
    const requestId = extractRequestId(request);

    try {
      const token = request.nextUrl.searchParams.get('token');
      const validated = VerifyEmailSchema.parse({ token });

      const authService = getJwtAuthService();
      const result = await authService.verifyEmail({
        token: validated.token,
      });

      return sendSuccessJson(
        {
          data: result,
          message: 'Email verified successfully.',
          request_id: requestId,
          status: 200,
        },
        { status: 200 },
      );
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'public',
  },
);
