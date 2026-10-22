import type { NextRequest } from 'next/server';
import { getGetProfilePackUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// The confirmed, token-capped projection the runtime receives; `pack` is null
// until the workspace has a profile. Read-only: it shows what is sent, it
// cannot change it.
export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const pack = await getGetProfilePackUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
      });
      return sendSuccessJson({
        data: { pack },
        message: 'Profile pack retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'business_profile.view' },
);
