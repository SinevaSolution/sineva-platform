import type { NextRequest } from 'next/server';
import { InviteMemberSchema } from '@/server/application/dtos/member_dto';
import { getInviteMemberUseCase, getListInvitationsUseCase } from '@/server/container';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const invitations = await getListInvitationsUseCase().execute({ context: requestContext });
      return sendSuccessJson({
        data: invitations,
        message: 'Invitations retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'member.invite' },
);

// The only response that carries the plain link (`invite_url`), so the inviter
// can copy it into WhatsApp. The guard admits owner and admin; the use case
// applies the role ceiling (an admin cannot invite an admin).
export const POST = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const body = InviteMemberSchema.parse(await parseJsonBody(request));
      const result = await getInviteMemberUseCase().execute({ context: requestContext, ...body });
      return sendSuccessJson(
        {
          data: result,
          message: 'Invitation created successfully.',
          request_id: requestContext.request_id,
          status: 201,
        },
        { status: 201 },
      );
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'member.invite' },
);
