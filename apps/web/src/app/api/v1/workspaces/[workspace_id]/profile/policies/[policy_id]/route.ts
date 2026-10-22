import type { NextRequest } from 'next/server';
import { getDeletePolicyUseCase, getUpdatePolicyUseCase } from '@/server/container';
import { PolicyUpdateSchema } from '@/server/application/dtos/business_profile_dto';
import { UuidParamSchema } from '@/server/application/dtos/onboarding_dto';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const PATCH = withAuth<{ workspace_id: string; policy_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const policyId = UuidParamSchema.parse(params?.policy_id);
      const input = PolicyUpdateSchema.parse(await parseJsonBody(request));
      const result = await getUpdatePolicyUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        user_id: requestContext.user_id,
        policy_id: policyId,
        input,
        context: requestContext,
      });
      return sendSuccessJson({
        data: result,
        message: 'Policy updated successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'business_profile.update' },
);

export const DELETE = withAuth<{ workspace_id: string; policy_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const policyId = UuidParamSchema.parse(params?.policy_id);
      const result = await getDeletePolicyUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        user_id: requestContext.user_id,
        policy_id: policyId,
        context: requestContext,
      });
      return sendSuccessJson({
        data: result,
        message: 'Policy deleted successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'business_profile.update' },
);
