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
import { verifyCsrf } from '@/server/http/csrf_guard';
import { withAuth } from '@/server/http/with_auth';

const SignInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const POST = withAuth(
  async (request: NextRequest) => {
    const requestId = extractRequestId(request);

    try {
      verifyCsrf(request);
      const body = await parseJsonBody(request);
      const validated = SignInSchema.parse(body);

      const ipAddress =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        '127.0.0.1';
      const userAgent = request.headers.get('user-agent') || undefined;

      const authService = getJwtAuthService();
      const result = await authService.signIn({
        email: validated.email,
        password: validated.password,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      const response = sendSuccessJson(
        {
          data: {
            user: result.user,
            session: {
              id: result.session.id,
              fresh_until: result.session.fresh_until,
              expires_at: result.session.expires_at,
            },
          },
          message: 'Signed in successfully.',
          request_id: requestId,
          status: 200,
        },
        { status: 200 },
      );

      // Set secure HTTP-only cookie with JWT token
      setSessionCookie(response, result.session.token);

      return response;
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'public',
  },
);
