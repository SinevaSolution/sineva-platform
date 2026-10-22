import type { NextRequest } from 'next/server';
import { LinkTokenParamSchema } from '@/server/application/dtos/member_dto';
import { getAcceptOwnershipTransferUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// Global path like the invitation accept. Taking over a workspace is a
// sensitive action, so a fresh session is required (FR-AUTH-06); the use case
// binds the link to the one account the owner chose.
export const POST = withAuth<{ token: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const accepted = await getAcceptOwnershipTransferUseCase().execute({
        token: LinkTokenParamSchema.parse(params?.token),
        context: requestContext,
      });
      return sendSuccessJson({
        data: accepted,
        message: 'Ownership transferred.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'user', requireFreshSession: true },
);
