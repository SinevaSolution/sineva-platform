import type { NextRequest } from 'next/server';
import { getCreateFirstWorkspaceUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// User-scoped and on a global path because the person has no workspace yet.
// No body is read: who is asking comes from the session, and there is nothing
// else to choose (the provisional workspace is named and renamed by onboarding).
export const POST = withAuth(
  async (request: NextRequest, { requestContext }) => {
    try {
      const result = await getCreateFirstWorkspaceUseCase().execute({
        user_id: requestContext.user_id,
        context: requestContext,
      });
      return sendSuccessJson({
        data: { workspace: result.workspace, onboarding: result.state },
        message: 'Workspace created successfully.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'user' },
);
