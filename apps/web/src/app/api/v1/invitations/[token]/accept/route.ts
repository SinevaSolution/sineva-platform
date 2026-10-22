import type { NextRequest } from 'next/server';
import { LinkTokenParamSchema } from '@/server/application/dtos/member_dto';
import { getAcceptInvitationUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// Global path (D-M0-1): the client holds only the token, not the workspace.
// User scope, not workspace scope: the caller is not a member yet. The use
// case binds the link to the signed-in, verified account whose email matches.
export const POST = withAuth<{ token: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const accepted = await getAcceptInvitationUseCase().execute({
        token: LinkTokenParamSchema.parse(params?.token),
        context: requestContext,
      });
      return sendSuccessJson({
        data: accepted,
        message: 'Invitation accepted.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'user' },
);
