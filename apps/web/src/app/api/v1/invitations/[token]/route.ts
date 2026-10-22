import type { NextRequest } from 'next/server';
import { LinkTokenParamSchema } from '@/server/application/dtos/member_dto';
import { getPreviewInvitationUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// Public on purpose: the link holder sees the workspace name, the inviter's
// first name, the role and the link state before signing in. The 256-bit token
// is the only secret, and the answer holds no email and no id. A session, when
// present, only adds whether its own email matches.
export const GET = withAuth<{ token: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const signedIn = requestContext.user_id !== 'anonymous';
      const preview = await getPreviewInvitationUseCase().execute({
        token: LinkTokenParamSchema.parse(params?.token),
        viewer_user_id: signedIn ? requestContext.user_id : undefined,
      });
      return sendSuccessJson({
        data: preview,
        message: 'Invitation retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'public' },
);
