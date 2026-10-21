import type { NextRequest } from 'next/server';
import { resolveSession, withAuth } from '@/server/http/with_auth';
import {
  extractRequestId,
  handleRouteError,
  sendSuccessJson,
} from '@/server/http/response_helper';
import { UnauthorizedError } from '@/server/domain/errors/domain_error';

export const GET = withAuth(
  async (request: NextRequest) => {
    const requestId = extractRequestId(request);

    try {
      const session = await resolveSession(request);

      if (!session) {
        throw new UnauthorizedError('No active session.');
      }

      return sendSuccessJson(
        {
          data: {
            user_id: session.userId,
            session_id: session.sessionId,
            role: session.role,
            email_verified: session.emailVerified,
            fresh_until: session.freshUntil,
            staff_role: session.staffRole,
            memberships: session.memberships,
          },
          message: 'Active session retrieved.',
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
