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

const RequestPasswordResetSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const POST = withAuth(
  async (request: NextRequest) => {
    const requestId = extractRequestId(request);

    try {
      verifyCsrf(request);
      const body = await parseJsonBody(request);
      const validated = RequestPasswordResetSchema.parse(body);

      const authService = getJwtAuthService();
      const result = await authService.requestPasswordReset({
        email: validated.email,
      });

      return sendSuccessJson(
        {
          data: result,
          message: result.message,
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
