import type { NextRequest } from 'next/server';
import { getUnlinkAccountUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const DELETE = withAuth(
  async (
    request: NextRequest,
    {
      requestContext,
      params,
    }: {
      requestContext: import('@/server/domain/context/request_context').RequestContext;
      params?: Promise<{ provider: string }> | { provider: string };
    },
  ) => {
    try {
      const resolvedParams = await Promise.resolve(params);
      const provider = resolvedParams?.provider?.toLowerCase();
      if (!provider) {
        throw new Error('Provider parameter is required');
      }

      const useCase = getUnlinkAccountUseCase();
      await useCase.execute({
        userId: requestContext.user_id,
        provider,
        requestContext,
      });

      return sendSuccessJson({
        data: { success: true },
        message: `Provider '${provider}' unlinked successfully.`,
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  {
    scope: 'user',
    requireFreshSession: true, // FR-AUTH-01c: Unlink requires a fresh session
  },
);
