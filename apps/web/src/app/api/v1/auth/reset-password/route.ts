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

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  new_password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password cannot exceed 128 characters'),
});

export const POST = withAuth(
  async (request: NextRequest) => {
    const requestId = extractRequestId(request);

    try {
      verifyCsrf(request);
      const body = await parseJsonBody(request);
      const validated = ResetPasswordSchema.parse(body);

      const authService = getJwtAuthService();
      const result = await authService.resetPassword({
        token: validated.token,
        new_password: validated.new_password,
      });

      return sendSuccessJson(
        {
          data: result,
          message: 'Password reset successfully. Please sign in with your new password.',
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
