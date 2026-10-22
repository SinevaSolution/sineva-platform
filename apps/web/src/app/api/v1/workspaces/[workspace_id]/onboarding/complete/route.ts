import type { NextRequest } from 'next/server';
import { getCompleteOnboardingUseCase } from '@/server/container';
import { CompleteOnboardingSchema } from '@/server/application/dtos/onboarding_dto';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const POST = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const input = CompleteOnboardingSchema.parse(await parseJsonBody(request));
      const result = await getCompleteOnboardingUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        user_id: requestContext.user_id,
        role: requestContext.role ?? 'member',
        input,
        context: requestContext,
      });
      return sendSuccessJson({
        data: {
          onboarding: result.state,
          profile: result.profile,
          offerings: result.offerings,
          policies: result.policies,
          version: result.version,
          warnings: result.warnings,
        },
        message: 'Profile confirmed successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'onboarding.run' },
);
