import type { NextRequest } from 'next/server';
import { LinkTokenParamSchema } from '@/server/application/dtos/member_dto';
import { getPreviewOwnershipTransferUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// Public preview, same reasoning as the invitation preview: workspace name,
// the previous owner's first name and the link state, nothing else.
export const GET = withAuth<{ token: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const signedIn = requestContext.user_id !== 'anonymous';
      const preview = await getPreviewOwnershipTransferUseCase().execute({
        token: LinkTokenParamSchema.parse(params?.token),
        viewer_user_id: signedIn ? requestContext.user_id : undefined,
      });
      return sendSuccessJson({
        data: preview,
        message: 'Ownership transfer retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'public' },
);
