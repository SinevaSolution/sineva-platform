import type { NextRequest } from 'next/server';
import { getListUserAccountsUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const GET = withAuth(
  async (request: NextRequest, { requestContext }) => {
    try {
      const useCase = getListUserAccountsUseCase();
      const accounts = await useCase.execute(requestContext.user_id);

      return sendSuccessJson({
        data: { accounts },
        message: 'Accounts retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  {
    scope: 'user',
  },
);
