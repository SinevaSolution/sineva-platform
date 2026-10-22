import type { NextRequest } from 'next/server';
import { IdParamSchema } from '@/server/application/dtos/member_dto';
import { getRevokeInvitationUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const DELETE = withAuth<{ workspace_id: string; invitation_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      await getRevokeInvitationUseCase().execute({
        context: requestContext,
        invitation_id: IdParamSchema.parse(params?.invitation_id),
      });
      return sendSuccessJson({
        data: null,
        message: 'Invitation revoked successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'member.invite' },
);
