import type { NextRequest } from 'next/server';
import { getGetOnboardingUseCase, getUpdateOnboardingUseCase } from '@/server/container';
import { PatchOnboardingSchema } from '@/server/application/dtos/onboarding_dto';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// Any member may read and save their OWN state: the owner runs the five-step
// flow, everyone else the two-screen welcome. The use case picks the flow from
// the role (`onboarding.run`), so there is no route-level owner gate here.
export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const result = await getGetOnboardingUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        user_id: requestContext.user_id,
        role: requestContext.role ?? 'member',
      });
      return sendSuccessJson({
        data: { onboarding: result.state, checklist: result.checklist },
        message: 'Onboarding state retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workspace.view' },
);

export const PATCH = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const body = PatchOnboardingSchema.parse(await parseJsonBody(request));
      const result = await getUpdateOnboardingUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        user_id: requestContext.user_id,
        role: requestContext.role ?? 'member',
        step: body.step,
        action: body.action,
        answers: body.answers,
        context: requestContext,
      });
      return sendSuccessJson({
        data: { onboarding: result.state, workspace: result.workspace },
        message: 'Onboarding step saved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workspace.view' },
);
