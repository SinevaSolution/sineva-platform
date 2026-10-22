import type { NextRequest } from 'next/server';
import { IdParamSchema } from '@/server/application/dtos/member_dto';
import { getResendInvitationUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// Issues a new token and 7 days; the previous link stops working. Like create,
// this response carries the new plain link for copying.
export const POST = withAuth<{ workspace_id: string; invitation_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const result = await getResendInvitationUseCase().execute({
        context: requestContext,
        invitation_id: IdParamSchema.parse(params?.invitation_id),
      });
      return sendSuccessJson({
        data: result,
        message: 'Invitation sent again.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'member.invite' },
);
