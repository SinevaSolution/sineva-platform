import type { NextRequest } from 'next/server';
import { getDeleteOfferingUseCase, getUpdateOfferingUseCase } from '@/server/container';
import { OfferingUpdateSchema } from '@/server/application/dtos/business_profile_dto';
import { UuidParamSchema } from '@/server/application/dtos/onboarding_dto';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const PATCH = withAuth<{ workspace_id: string; offering_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const offeringId = UuidParamSchema.parse(params?.offering_id);
      const input = OfferingUpdateSchema.parse(await parseJsonBody(request));
      const result = await getUpdateOfferingUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        user_id: requestContext.user_id,
        offering_id: offeringId,
        input,
        context: requestContext,
      });
      return sendSuccessJson({
        data: result,
        message: 'Offering updated successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'business_profile.update' },
);

export const DELETE = withAuth<{ workspace_id: string; offering_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const offeringId = UuidParamSchema.parse(params?.offering_id);
      const result = await getDeleteOfferingUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        user_id: requestContext.user_id,
        offering_id: offeringId,
        context: requestContext,
      });
      return sendSuccessJson({
        data: result,
        message: 'Offering deleted successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'business_profile.update' },
);
