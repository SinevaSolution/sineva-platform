import type { NextRequest } from 'next/server';
import { getListMembersUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// Every role may list; the use case decides which fields each role sees
// (contact data needs member.view_contact).
export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const members = await getListMembersUseCase().execute({ context: requestContext });
      return sendSuccessJson({
        data: members,
        message: 'Members retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'member.view' },
);
